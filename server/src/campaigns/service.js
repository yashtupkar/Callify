const { CAMPAIGN_STATUS: C, RECIPIENT_STATUS: R, SKIP_REASON, CHANNEL, limits } = require('./constants');
const { parseRecipients } = require('./recipients');
const {
  normalizeMetaTemplate, validateTemplateConfig, buildTemplateComponents, renderTemplatePreview,
  renderPlainText, validatePlainTextConfig, MissingVariableError,
} = require('./templates');

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const TEMPLATE_CACHE_MS = 60 * 1000;
const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
};
const channelOf = (connection) => (String(connection.provider).toLowerCase() === 'baileys' ? CHANNEL.BAILEYS : CHANNEL.CLOUD_API);
const csvCell = (value) => {
  let text = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; // neutralise spreadsheet formula injection
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function createService({ repo, createProvider, now = () => new Date() }) {
  const templateCache = new Map();

  async function requireConnection(workspaceId, connectionId) {
    if (!connectionId || typeof connectionId !== 'string') throw new ApiError(400, 'CONNECTION_REQUIRED', 'Select a WhatsApp account');
    const connection = await repo.getConnection(workspaceId, connectionId);
    if (!connection) throw new ApiError(404, 'CONNECTION_NOT_FOUND', 'WhatsApp account not found');
    if (!connection.enabled) throw new ApiError(409, 'CONNECTION_DISABLED', 'This WhatsApp account is disabled');
    return connection;
  }

  async function fetchTemplates(connection, { force = false } = {}) {
    const cached = templateCache.get(connection.id);
    if (!force && cached && cached.expires > Date.now()) return cached.templates;
    const provider = createProvider(connection);
    if (typeof provider.listTemplates !== 'function') throw new ApiError(400, 'TEMPLATES_UNSUPPORTED', 'This account does not support templates');
    let raw;
    try {
      raw = await provider.listTemplates();
    } catch (error) {
      throw new ApiError(502, 'TEMPLATE_FETCH_FAILED', `Could not load templates from Meta: ${error.metaError?.message || error.message}`);
    }
    const templates = raw.map(normalizeMetaTemplate);
    templateCache.set(connection.id, { templates, expires: Date.now() + TEMPLATE_CACHE_MS });
    return templates;
  }

  async function findTemplate(connection, name, language, opts) {
    const templates = await fetchTemplates(connection, opts);
    const template = templates.find((t) => t.name === name && t.language === language);
    if (!template) throw new ApiError(404, 'TEMPLATE_NOT_FOUND', 'Template not found on this WhatsApp Business Account');
    return template;
  }

  async function listConnections(workspaceId) {
    const rows = await repo.listConnections(workspaceId);
    return rows.map((c) => ({
      id: c.id,
      provider: c.provider,
      channel: channelOf(c),
      phoneNumber: c.phoneNumber,
      enabled: c.enabled,
      automationName: c.automation?.name || null,
      limits: limits()[channelOf(c)],
    }));
  }

  async function listTemplates(workspaceId, connectionId) {
    const connection = await requireConnection(workspaceId, connectionId);
    if (channelOf(connection) !== CHANNEL.CLOUD_API) throw new ApiError(400, 'NOT_CLOUD_API', 'Templates are only available for Meta Cloud API accounts');
    return fetchTemplates(connection, { force: true });
  }

  async function classifyRecipients(workspaceId, input, channel) {
    const cap = limits()[channel];
    let parsed;
    try {
      parsed = parseRecipients({
        file: input.file,
        manualNumbers: input.manualNumbers,
        defaultCountryCode: input.defaultCountryCode,
        phoneColumn: input.phoneColumn,
        maxRecipients: cap.maxRecipients,
      });
    } catch (error) {
      if (error.status === 400) throw new ApiError(400, error.code, error.message);
      throw error;
    }
    const phones = [...parsed.valid, ...parsed.noConsent].map((r) => r.phone);
    const optedOut = await repo.optedOutPhones(workspaceId, phones);
    const sendable = parsed.valid.filter((r) => !optedOut.has(r.phone));
    return {
      parsed,
      sendable,
      optedOut: parsed.valid.filter((r) => optedOut.has(r.phone)),
      noConsent: parsed.noConsent,
    };
  }

  const messageConfig = (input) => ({ variableMap: input.variableMap || {}, headerMediaUrl: input.headerMediaUrl || null });

  async function validateMessage(connection, input, columns) {
    const channel = channelOf(connection);
    const config = messageConfig(input);
    if (channel === CHANNEL.CLOUD_API) {
      if (!input.templateName || !input.templateLanguage) throw new ApiError(400, 'TEMPLATE_REQUIRED', 'Select an approved template');
      const template = await findTemplate(connection, input.templateName, input.templateLanguage, { force: true });
      const problems = validateTemplateConfig(template, config, { columns });
      if (problems.length) throw new ApiError(400, 'INVALID_TEMPLATE_CONFIG', problems[0], problems);
      return { channel, template, config };
    }
    const problems = validatePlainTextConfig(input.messageText, config, { columns });
    if (problems.length) throw new ApiError(400, 'INVALID_MESSAGE', problems[0], problems);
    return { channel, template: null, config };
  }

  function renderFor(channel, template, input, config, recipient) {
    if (channel === CHANNEL.CLOUD_API) {
      buildTemplateComponents(template, config, recipient); // throws MissingVariableError
      return renderTemplatePreview(template, config, recipient);
    }
    return { body: renderPlainText(input.messageText, config, recipient) };
  }

  async function previewRecipients(workspaceId, input) {
    const connection = await requireConnection(workspaceId, input.connectionId);
    const channel = channelOf(connection);
    const result = await classifyRecipients(workspaceId, input, channel);
    const cap = limits()[channel];
    return {
      channel,
      total: result.parsed.total,
      validCount: result.sendable.length,
      invalidCount: result.parsed.invalid.length,
      duplicateCount: result.parsed.duplicates,
      optedOutCount: result.optedOut.length,
      noConsentCount: result.noConsent.length,
      columns: result.parsed.columns,
      sample: result.sendable.slice(0, 10),
      invalid: result.parsed.invalid.slice(0, 100),
      limits: cap,
      estimatedMinutes: Math.ceil(result.sendable.length / cap.defaultRatePerMinute),
    };
  }

  async function previewMessage(workspaceId, input) {
    const connection = await requireConnection(workspaceId, input.connectionId);
    const columns = Array.isArray(input.columns) ? input.columns.map(String) : [];
    const { channel, template, config } = await validateMessage(connection, input, columns);
    const sample = input.sampleRecipient && typeof input.sampleRecipient === 'object'
      ? { phone: String(input.sampleRecipient.phone || ''), name: input.sampleRecipient.name || null, variables: input.sampleRecipient.variables || {} }
      : { phone: '', name: null, variables: {} };
    try {
      return { channel, preview: renderFor(channel, template, input, config, sample) };
    } catch (error) {
      if (error instanceof MissingVariableError) return { channel, preview: null, missingVariable: error.placeholder };
      throw error;
    }
  }

  async function createCampaign(workspaceId, user, input) {
    const name = String(input.name || '').trim();
    if (!name || name.length > 120) throw new ApiError(400, 'INVALID_NAME', 'Campaign name is required (max 120 characters)');
    const connection = await requireConnection(workspaceId, input.connectionId);
    const channel = channelOf(connection);
    const cap = limits()[channel];

    const optIn = input.optIn || {};
    if (optIn.confirmed !== true || String(optIn.source || '').trim().length < 3) {
      throw new ApiError(400, 'OPT_IN_REQUIRED', 'Confirm that every recipient has opted in to receive WhatsApp messages and describe how consent was collected');
    }
    if (channel === CHANNEL.BAILEYS && input.acceptUnofficialRisk !== true) {
      throw new ApiError(400, 'UNOFFICIAL_RISK_NOT_ACCEPTED', 'Baileys is an unofficial connection and bulk messaging can get the number banned. Acknowledge this risk to continue.');
    }

    const result = await classifyRecipients(workspaceId, input.recipients || {}, channel);
    const { channel: ch, template, config } = await validateMessage(connection, input, result.parsed.columns);

    const items = [];
    let missingVariable = 0;
    let sendable = 0;
    for (const r of result.sendable) {
      try {
        renderFor(ch, template, input, config, r);
        items.push({ ...r, status: R.PENDING });
        sendable += 1;
      } catch (error) {
        if (!(error instanceof MissingVariableError)) throw new ApiError(400, error.code || 'INVALID_MESSAGE', error.message);
        items.push({ ...r, status: R.SKIPPED, skipReason: SKIP_REASON.MISSING_VARIABLE });
        missingVariable += 1;
      }
    }
    for (const r of result.optedOut) items.push({ ...r, status: R.SKIPPED, skipReason: SKIP_REASON.OPTED_OUT });
    for (const r of result.noConsent) items.push({ ...r, status: R.SKIPPED, skipReason: SKIP_REASON.NO_OPT_IN });
    for (const r of result.parsed.invalid) items.push({ phone: null, rawPhone: r.rawPhone, status: R.SKIPPED, skipReason: SKIP_REASON.INVALID_NUMBER });
    if (!sendable) throw new ApiError(400, 'NO_SENDABLE_RECIPIENTS', 'No recipients can be sent to');

    const idempotencyKey = input.idempotencyKey ? String(input.idempotencyKey).slice(0, 100) : null;
    const { campaign, existing } = await repo.createCampaign({
      workspaceId,
      connectionId: connection.id,
      createdById: user?.id || null,
      idempotencyKey,
      name,
      channel,
      templateName: template?.name || null,
      templateLanguage: template?.language || null,
      templateSnapshot: template ? { ...template } : { unofficialRiskAccepted: true },
      messageText: channel === CHANNEL.BAILEYS ? String(input.messageText).trim() : null,
      variableMap: config.variableMap,
      headerMediaUrl: config.headerMediaUrl,
      defaultCountryCode: input.recipients?.defaultCountryCode ? String(input.recipients.defaultCountryCode).replace(/\D/g, '') : null,
      concurrency: clamp(input.concurrency, 1, cap.maxConcurrency, cap.defaultConcurrency),
      ratePerMinute: clamp(input.ratePerMinute, 1, cap.maxRatePerMinute, cap.defaultRatePerMinute),
      maxAttempts: clamp(input.maxAttempts, 1, 5, 3),
      dailyLimit: clamp(input.dailyLimit, 1, 1000000, cap.defaultDailyCap),
      optInConfirmedAt: now(),
      optInConfirmedBy: user?.id || null,
      optInSource: String(optIn.source).trim().slice(0, 300),
      duplicateCount: result.parsed.duplicates,
    }, items);
    return { campaign, existing, summary: { sendable, missingVariable, optedOut: result.optedOut.length, invalid: result.parsed.invalid.length, noConsent: result.noConsent.length, duplicates: result.parsed.duplicates } };
  }

  async function requireCampaign(workspaceId, id) {
    const campaign = await repo.getCampaign(workspaceId, id);
    if (!campaign) throw new ApiError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
    return campaign;
  }

  async function launch(workspaceId, id, input = {}) {
    const campaign = await requireCampaign(workspaceId, id);
    if (campaign.status !== C.DRAFT) throw new ApiError(409, 'INVALID_STATE', `Campaign is already ${campaign.status}`);
    const counts = (await repo.counts(id))[id];
    const pending = counts[R.PENDING] || 0;
    if (!pending) throw new ApiError(400, 'NO_SENDABLE_RECIPIENTS', 'No recipients to send to');
    if (Number(input.confirmRecipientCount) !== pending) {
      throw new ApiError(409, 'COUNT_MISMATCH', `Confirm the recipient count (${pending})`);
    }
    const connection = await requireConnection(workspaceId, campaign.connectionId);
    if (channelOf(connection) === CHANNEL.CLOUD_API) {
      const template = await findTemplate(connection, campaign.templateName, campaign.templateLanguage, { force: true });
      if (template.status !== 'APPROVED') throw new ApiError(409, 'TEMPLATE_NOT_APPROVED', `Template is ${template.status}; it must be APPROVED`);
    } else if (input.acceptUnofficialRisk !== true) {
      throw new ApiError(400, 'UNOFFICIAL_RISK_NOT_ACCEPTED', 'Acknowledge the unofficial connection risk to launch');
    }
    await repo.queueRecipients(id, now());
    const ok = await repo.transition(id, [C.DRAFT], { status: C.RUNNING, launchedAt: now(), statusNote: null });
    if (!ok) throw new ApiError(409, 'INVALID_STATE', 'Campaign was already launched or cancelled');
    return getStatus(workspaceId, id);
  }

  async function pause(workspaceId, id) {
    await requireCampaign(workspaceId, id);
    const ok = await repo.transition(id, [C.RUNNING], { status: C.PAUSED, pausedAt: now(), statusNote: 'Paused by user' });
    if (!ok) throw new ApiError(409, 'INVALID_STATE', 'Only a running campaign can be paused');
    return getStatus(workspaceId, id);
  }

  async function resume(workspaceId, id) {
    await requireCampaign(workspaceId, id);
    const ok = await repo.transition(id, [C.PAUSED], { status: C.RUNNING, pausedAt: null, statusNote: null });
    if (!ok) throw new ApiError(409, 'INVALID_STATE', 'Only a paused campaign can be resumed');
    return getStatus(workspaceId, id);
  }

  async function cancel(workspaceId, id) {
    await requireCampaign(workspaceId, id);
    const ok = await repo.transition(id, [C.DRAFT, C.RUNNING, C.PAUSED], { status: C.CANCELLED, cancelledAt: now(), statusNote: 'Cancelled by user' });
    if (!ok) throw new ApiError(409, 'INVALID_STATE', 'Campaign can no longer be cancelled');
    await repo.skipUnsent(id, SKIP_REASON.CANCELLED);
    return getStatus(workspaceId, id);
  }

  function summarize(campaign, counts) {
    const get = (s) => counts[s] || 0;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const done = get(R.SENT) + get(R.DELIVERED) + get(R.READ) + get(R.FAILED) + get(R.SKIPPED);
    const accepted = get(R.SENT) + get(R.DELIVERED) + get(R.READ);
    const remaining = get(R.PENDING) + get(R.QUEUED);
    const rate = Math.min(campaign.ratePerMinute, limits()[campaign.channel]?.maxRatePerMinute || campaign.ratePerMinute);
    return {
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      status: campaign.status,
      statusNote: campaign.statusNote,
      templateName: campaign.templateName,
      templateLanguage: campaign.templateLanguage,
      connectionId: campaign.connectionId,
      concurrency: campaign.concurrency,
      ratePerMinute: campaign.ratePerMinute,
      maxAttempts: campaign.maxAttempts,
      dailyLimit: campaign.dailyLimit,
      duplicateCount: campaign.duplicateCount,
      createdAt: campaign.createdAt,
      launchedAt: campaign.launchedAt,
      completedAt: campaign.completedAt,
      cancelledAt: campaign.cancelledAt,
      tracksDelivery: campaign.channel === CHANNEL.CLOUD_API,
      counts: {
        total,
        pending: get(R.PENDING), queued: get(R.QUEUED), sent: get(R.SENT), delivered: get(R.DELIVERED),
        read: get(R.READ), failed: get(R.FAILED), skipped: get(R.SKIPPED),
        accepted,
      },
      progressPercent: total ? Math.round((done / total) * 100) : 0,
      estimatedMinutesRemaining: remaining ? Math.ceil(remaining / Math.max(1, rate)) : 0,
    };
  }

  async function getStatus(workspaceId, id) {
    const campaign = await requireCampaign(workspaceId, id);
    return summarize(campaign, (await repo.counts(id))[id]);
  }

  async function listCampaigns(workspaceId, { limit, offset } = {}) {
    const { items, total } = await repo.listCampaigns(workspaceId, {
      limit: clamp(limit, 1, 100, 50),
      offset: clamp(offset, 0, 1e9, 0),
    });
    const counts = items.length ? await repo.counts(items.map((c) => c.id)) : {};
    return { total, items: items.map((c) => summarize(c, counts[c.id] || {})) };
  }

  async function listRecipients(workspaceId, id, { status, limit, offset } = {}) {
    await requireCampaign(workspaceId, id);
    if (status && !Object.values(R).includes(status)) throw new ApiError(400, 'INVALID_STATUS', 'Unknown recipient status');
    return repo.listRecipients(id, { status, limit: clamp(limit, 1, 500, 100), offset: clamp(offset, 0, 1e9, 0) });
  }

  async function fetchAll(id, status) {
    const out = [];
    for (let offset = 0; ; offset += 1000) {
      const { items } = await repo.listRecipients(id, { status, limit: 1000, offset });
      out.push(...items);
      if (items.length < 1000) break;
    }
    return out;
  }

  async function report(workspaceId, id) {
    const summary = await getStatus(workspaceId, id);
    const failed = await fetchAll(id, R.FAILED);
    const skipped = await fetchAll(id, R.SKIPPED);
    const group = (rows, field) => rows.reduce((acc, r) => {
      const key = r[field] || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return {
      summary,
      failureReasons: group(failed, 'errorCode'),
      skipReasons: group(skipped, 'skipReason'),
      failures: failed.slice(0, 500).map((r) => ({ phone: r.phone, name: r.name, errorCode: r.errorCode, errorMessage: r.errorMessage, attempts: r.attempts, failedAt: r.failedAt })),
      note: summary.tracksDelivery
        ? '"Sent" means the provider accepted the message; delivery and read states come from WhatsApp status webhooks and may be missing if webhooks are not configured.'
        : 'Baileys cannot report delivery; "sent" only means the message was handed to the WhatsApp socket.',
    };
  }

  async function reportCsv(workspaceId, id) {
    await requireCampaign(workspaceId, id);
    const rows = await fetchAll(id);
    const header = ['phone', 'name', 'status', 'skipReason', 'errorCode', 'errorMessage', 'attempts', 'queuedAt', 'sentAt', 'deliveredAt', 'readAt', 'failedAt'];
    const lines = [header.join(',')];
    for (const r of rows) lines.push(header.map((h) => csvCell(h === 'phone' ? r.phone || r.rawPhone : r[h])).join(','));
    return lines.join('\n');
  }

  async function getConfig(workspaceId, id) {
    const c = await requireCampaign(workspaceId, id);
    return {
      name: c.name, channel: c.channel, templateName: c.templateName, templateLanguage: c.templateLanguage,
      messageText: c.messageText, variableMap: c.variableMap || {}, headerMediaUrl: c.headerMediaUrl,
      concurrency: c.concurrency, ratePerMinute: c.ratePerMinute, maxAttempts: c.maxAttempts, dailyLimit: c.dailyLimit,
      status: c.status,
    };
  }

  // Draft: name, message and sending settings. Paused: name and sending settings only. Recipients are never changed here.
  async function updateCampaign(workspaceId, id, input = {}) {
    const campaign = await requireCampaign(workspaceId, id);
    if (![C.DRAFT, C.PAUSED].includes(campaign.status)) {
      throw new ApiError(409, 'INVALID_STATE', 'Only draft or paused campaigns can be edited');
    }
    const cap = limits()[campaign.channel];
    const patch = {};
    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (!name || name.length > 120) throw new ApiError(400, 'INVALID_NAME', 'Campaign name is required (max 120 characters)');
      patch.name = name;
    }
    if (input.concurrency !== undefined) patch.concurrency = clamp(input.concurrency, 1, cap.maxConcurrency, campaign.concurrency);
    if (input.ratePerMinute !== undefined) patch.ratePerMinute = clamp(input.ratePerMinute, 1, cap.maxRatePerMinute, campaign.ratePerMinute);
    if (input.maxAttempts !== undefined) patch.maxAttempts = clamp(input.maxAttempts, 1, 5, campaign.maxAttempts);
    if (input.dailyLimit !== undefined) patch.dailyLimit = clamp(input.dailyLimit, 1, 1000000, campaign.dailyLimit);

    const messageEdit = ['templateName', 'templateLanguage', 'messageText', 'variableMap', 'headerMediaUrl'].some((k) => input[k] !== undefined);
    if (messageEdit) {
      if (campaign.status !== C.DRAFT) throw new ApiError(409, 'MESSAGE_LOCKED', 'The message can only be edited before the campaign is launched');
      const connection = await requireConnection(workspaceId, campaign.connectionId);
      const sample = (await repo.listRecipients(id, { status: R.PENDING, limit: 1, offset: 0 })).items[0];
      const columns = Object.keys(sample?.variables || {});
      const merged = {
        templateName: input.templateName ?? campaign.templateName,
        templateLanguage: input.templateLanguage ?? campaign.templateLanguage,
        messageText: input.messageText ?? campaign.messageText,
        variableMap: input.variableMap ?? campaign.variableMap,
        headerMediaUrl: input.headerMediaUrl !== undefined ? input.headerMediaUrl : campaign.headerMediaUrl,
      };
      const { channel, template, config } = await validateMessage(connection, merged, columns);
      if (channel === CHANNEL.CLOUD_API) {
        if (template.status !== 'APPROVED') throw new ApiError(409, 'TEMPLATE_NOT_APPROVED', `Template is ${template.status}; it must be APPROVED`);
        Object.assign(patch, { templateName: template.name, templateLanguage: template.language, templateSnapshot: { ...template } });
      } else {
        patch.messageText = String(merged.messageText).trim();
      }
      Object.assign(patch, { variableMap: config.variableMap, headerMediaUrl: config.headerMediaUrl });
    }
    if (!Object.keys(patch).length) return getStatus(workspaceId, id);
    const ok = await repo.transition(id, [campaign.status], patch);
    if (!ok) throw new ApiError(409, 'INVALID_STATE', 'Campaign changed state; reload and try again');
    return getStatus(workspaceId, id);
  }

  return {
    listConnections, listTemplates, previewRecipients, previewMessage, createCampaign, launch, pause, resume, cancel,
    getStatus, listCampaigns, listRecipients, report, reportCsv, getConfig, updateCampaign,
  };
}

module.exports = { createService, ApiError, channelOf };
