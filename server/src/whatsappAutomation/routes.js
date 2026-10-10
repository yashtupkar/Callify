const express = require('express');
const { dbService } = require('../services/DatabaseService');
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const { createWhatsAppAutomationProvider } = require('./factory');
const { store } = require('./sessionStore');
const { encryptConnectionSecrets } = require('./secretBox');
const { createCrmRouter } = require('./tools/crmRoutes');
const { BUILT_IN_TOOLS } = require('./tools');

const router = express.Router();
router.use(authMiddleware);

const BUILT_IN_TOOL_NAMES = BUILT_IN_TOOLS.map((tool) => tool.name);

function buildToolRows(capabilities = [], suppliedTools = []) {
  const configured = new Map(
    (Array.isArray(suppliedTools) ? suppliedTools : [])
      .filter((tool) => tool && tool.name)
      .map((tool) => [tool.name, tool])
  );
  const requested = new Set(
    (Array.isArray(capabilities) ? capabilities : [])
      .map((capability) => typeof capability === 'string' ? capability : capability?.name)
      .filter(Boolean)
  );
  const names = new Set([...BUILT_IN_TOOL_NAMES, ...requested, ...configured.keys()]);

  return [...names].map((name) => {
    const tool = configured.get(name) || {};
    return {
      name,
      description: tool.description || `Business automation tool: ${name}`,
      schema: tool.schema || {
        type: 'function',
        function: {
          name,
          description: tool.description || `Business automation tool: ${name}`,
          parameters: { type: 'object', properties: {}, additionalProperties: true },
        },
      },
      config: tool.config || null,
      enabled: tool.enabled !== false && (BUILT_IN_TOOL_NAMES.includes(name) || requested.size === 0 || requested.has(name) || configured.has(name)),
    };
  });
}

function buildGeneratedPrompt(profile, capabilities, knowledgeSources, enabledTools) {
  const businessName = profile.businessName || 'the business';
  const facts = [profile.description, ...(Array.isArray(knowledgeSources) ? knowledgeSources : [])]
    .filter(Boolean)
    .join('\n');
  const toolText = enabledTools.length ? enabledTools.join(', ') : 'none';
  return [
    `You are the WhatsApp assistant for ${businessName}.`,
    facts ? `Business information:\n${facts}` : '',
    `Use only confirmed business information. Enabled tools: ${toolText}.`,
    `Reply concisely for WhatsApp. Ask for missing information before taking action.`,
    `When sending interactive messages, return JSON with _type set to text, button, list, cta_url, media, template, flow, location, or handoff.`,
    `Configured capabilities: ${Array.isArray(capabilities) ? capabilities.map((capability) => typeof capability === 'string' ? capability : capability?.name).filter(Boolean).join(', ') || 'none' : 'none'}.`,
  ].filter(Boolean).join('\n\n');
}

async function syncSetupRecords(tx, automationId, setup) {
  if (!setup || typeof setup !== 'object') return;
  if (typeof setup.knowledge === 'string') {
    await tx.whatsAppKnowledgeSource.deleteMany({ where: { automationId } });
    if (setup.knowledge.trim()) {
      await tx.whatsAppKnowledgeSource.create({
        data: {
          automationId,
          type: 'text',
          title: 'Business knowledge',
          content: setup.knowledge.trim(),
        },
      });
    }
  }
  if (Array.isArray(setup.products)) {
    await tx.whatsAppProduct.deleteMany({ where: { automationId } });
    const products = setup.products.filter(item => item?.name).map(item => ({
      automationId, name: item.name, description: item.description || null,
      price: item.price || null, category: item.category || null, imageUrl: item.imageUrl || null,
    }));
    if (products.length) await tx.whatsAppProduct.createMany({ data: products });
  }
  if (Array.isArray(setup.faqs)) {
    await tx.whatsAppFaq.deleteMany({ where: { automationId } });
    const faqs = setup.faqs.filter(item => item?.question && item?.answer).map((item, index) => ({
      automationId, question: item.question, answer: item.answer,
      keywords: Array.isArray(item.keywords) ? item.keywords : [], priority: index,
    }));
    if (faqs.length) await tx.whatsAppFaq.createMany({ data: faqs });
  }
  if (Array.isArray(setup.hours)) {
    await tx.whatsAppBusinessHour.deleteMany({ where: { automationId } });
    await tx.whatsAppBusinessHour.createMany({ data: setup.hours.map(hour => ({
      automationId, dayOfWeek: Number(hour.dayOfWeek), enabled: Boolean(hour.enabled),
      openTime: hour.openTime || null, closeTime: hour.closeTime || null,
    })) });
  }
}



async function resolveWorkspaceId(req) {
  if (req.user.workspaceId) return req.user.workspaceId;
  const workspace = await dbService.prisma.workspace.findFirst({
    where: { name: 'Default Workspace' },
    select: { id: true },
  }) || await dbService.prisma.workspace.findFirst({ select: { id: true } });
  return workspace?.id || null;
}

router.use('/crm', createCrmRouter(resolveWorkspaceId));

// Every route addressed by :automationId must belong to the caller's workspace.
// Admins are scoped too: the role grants rights inside a workspace, not across tenants.
router.param('automationId', async (req, res, next, automationId) => {
  try {
    const workspaceId = await resolveWorkspaceId(req);
    const owned = workspaceId && await dbService.prisma.whatsAppAutomation.findFirst({
      where: { id: automationId, workspaceId },
      select: { id: true },
    });
    if (!owned) return res.status(404).json({ error: 'Automation not found' });
    next();
  } catch (error) {
    console.error('[WhatsAppAutomation] workspace guard error:', error.message);
    res.status(500).json({ error: 'Failed to verify automation access' });
  }
});

// Webhook routing keys must be globally unique or one tenant could receive another tenant's traffic.
async function findRoutingConflict(data, excludeConnectionId) {
  const or = [];
  if (data.instanceId) or.push({ instanceId: String(data.instanceId) });
  if (data.phoneNumberId) or.push({ phoneNumberId: String(data.phoneNumberId) });
  if (!or.length) return null;
  return dbService.prisma.whatsAppConnection.findFirst({
    where: { OR: or, ...(excludeConnectionId ? { NOT: { id: excludeConnectionId } } : {}) },
    select: { id: true },
  });
}

router.get('/', async (req, res) => {
  try {
    const workspaceId = await resolveWorkspaceId(req);
    const where = { workspaceId };
    const automations = await dbService.prisma.whatsAppAutomation.findMany({ where, include: { connections: true, tools: true, autoReplies: true } });
    res.json({ automations: automations.map(automation => ({ ...automation, connections: automation.connections.map(scrub) })) });
  } catch (error) {
    console.error('[WhatsAppAutomation] list error:', error);
    res.status(500).json({ error: 'Failed to load WhatsApp automations' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const { name, description, language, supportedLanguages, initialMessage, businessName, timezone, status } = body;
    const onboarding = body.onboarding || {};
    const profile = {
      ...(onboarding.businessProfile || body.businessProfile || {}),
      businessName: businessName || onboarding.businessProfile?.businessName || body.businessProfile?.businessName,
      industryLabel: onboarding.businessProfile?.industryLabel || body.businessProfile?.industryLabel,
      description: description || onboarding.businessProfile?.description || body.businessProfile?.description,
      language: language || onboarding.businessProfile?.language,
      timezone: timezone || onboarding.businessProfile?.timezone,
    };
    const capabilities = onboarding.capabilities || body.capabilities || [];
    const knowledgeSources = onboarding.knowledgeSources || body.knowledgeSources || [];
    const tools = buildToolRows(capabilities, onboarding.tools || body.tools || []);
    const systemPrompt = body.systemPrompt || buildGeneratedPrompt(profile, capabilities, knowledgeSources, tools.filter((tool) => tool.enabled).map((tool) => tool.name));
    if (!name && !profile.businessName) return res.status(400).json({ error: 'businessName is required' });
    const workspaceId = await resolveWorkspaceId(req);
    if (!workspaceId) return res.status(500).json({ error: 'No workspace is configured for this account' });
    const automation = await dbService.prisma.$transaction(async (tx) => {
      const setup = onboarding.setup || {};
      const created = await tx.whatsAppAutomation.create({
        data: {
        workspaceId,
        name: name || profile.businessName,
        description: description || profile.description || null,
        language: language || 'en-US',
        supportedLanguages: Array.isArray(supportedLanguages) ? supportedLanguages : [language || 'en-US'],
        systemPrompt,
        initialMessage: initialMessage || null,
        businessName: profile.businessName || null,
        timezone: timezone || 'Asia/Kolkata',
        status: status || 'active',
        industry: setup.industry || profile.industryLabel || null,
        businessPhone: setup.businessPhone || null,
        businessEmail: setup.businessEmail || null,
        websiteUrl: setup.websiteUrl || null,
        address: setup.address || null,
        fallbackMode: setup.fallbackMode || 'ai',
        fallbackMessage: setup.fallbackMessage || null,
        handoffMessage: setup.handoffMessage || null,
        handoffKeywords: String(setup.handoffKeywords || '').split(',').map(value => value.trim()).filter(Boolean),
        tone: setup.tone || 'friendly',
        responseLength: setup.responseLength || 'balanced',
        setupStep: Number(setup.step || 1),
        setupCompleted: Boolean(setup.setupCompleted),
        activatedAt: status === 'active' ? new Date() : null,
        behaviorConfig: setup.behaviorConfig || null,
        capabilities: setup.capabilities || capabilities,
        promptConfig: {
          onboarding: { ...onboarding, businessProfile: profile, capabilities, knowledgeSources, tools },
        },
      },
      });
      if (tools.length) await tx.whatsAppAutomationTool.createMany({ data: tools.map((tool) => ({ ...tool, automationId: created.id })) });
      await syncSetupRecords(tx, created.id, setup);
      return tx.whatsAppAutomation.findUnique({ where: { id: created.id }, include: { tools: true, autoReplies: true } });
    });
    res.status(201).json({ automation });
  } catch (error) {
    console.error('[WhatsAppAutomation] create error:', error);
    res.status(500).json({ error: error.message || 'Failed to create WhatsApp automation' });
  }
});

// Checks Meta Cloud API credentials against the Graph API without saving anything.
router.post('/verify-cloud', requireAdmin, async (req, res) => {
  const axios = require('axios');
  const { phoneNumberId, businessId, apiToken, apiVersion } = req.body || {};
  const id = String(phoneNumberId || '').trim();
  const waba = String(businessId || '').trim();
  const token = String(apiToken || '').trim();
  if (!id || !token) {
    return res.status(400).json({ ok: false, error: 'Phone Number ID and access token are required.' });
  }
  const version = /^v\d+\.\d+$/.test(String(apiVersion || '')) ? apiVersion : (process.env.WHATSAPP_API_VERSION || 'v20.0');
  const base = `https://graph.facebook.com/${version}`;
  const headers = { Authorization: `Bearer ${token}` };
  const fail = (error) => {
    const message = error.response?.data?.error?.message || error.message || 'Verification failed';
    return res.json({ ok: false, error: message });
  };

  try {
    const { data: phone } = await axios.get(`${base}/${encodeURIComponent(id)}`, {
      headers,
      params: { fields: 'display_phone_number,verified_name,quality_rating' },
      timeout: 10000,
    });

    let warning = null;
    if (waba) {
      try {
        let url = `${base}/${encodeURIComponent(waba)}/phone_numbers`;
        let params = { fields: 'id', limit: 100 };
        let found = false;
        for (let page = 0; url && page < 10 && !found; page += 1) {
          const { data: list } = await axios.get(url, { headers, params, timeout: 10000 });
          found = (list.data || []).some((item) => String(item.id) === id);
          url = list.paging?.next || null;
          params = undefined;
        }
        if (!found) {
          warning = 'Token works, but this Phone Number ID was not found under the given WhatsApp Business Account ID.';
        }
      } catch (error) {
        warning = `Token works, but the Business Account ID could not be checked: ${error.response?.data?.error?.message || error.message}`;
      }
    }

    res.json({
      ok: true,
      warning,
      displayPhoneNumber: phone.display_phone_number || null,
      verifiedName: phone.verified_name || null,
      qualityRating: phone.quality_rating || null,
    });
  } catch (error) {
    fail(error);
  }
});

router.get('/sessions', requireAdmin, async (req, res) => {
  const workspaceId = await resolveWorkspaceId(req);
  const owned = await dbService.prisma.whatsAppAutomation.findMany({ where: { workspaceId }, select: { id: true } });
  const ids = new Set(owned.map((item) => item.id));
  res.json({ sessions: store.list().filter((session) => ids.has(session.automationId)).map(({ conversationManager, ...session }) => ({ ...session, messageCount: conversationManager?.transcript?.length || 0 })) });
});

router.get('/:automationId', async (req, res) => {
  try {
    const automation = await dbService.prisma.whatsAppAutomation.findFirst({
      where: {
        id: req.params.automationId,
      },
      include: { connections: true, tools: true, autoReplies: true, products: true, faqs: true, businessHours: true, knowledgeSources: true },
    });
    if (!automation) return res.status(404).json({ error: 'Automation not found' });
    res.json({ automation: { ...automation, connections: automation.connections.map(scrub) } });
  } catch (error) {
    console.error('[WhatsAppAutomation] get error:', error);
    res.status(500).json({ error: 'Failed to load WhatsApp automation' });
  }
});

router.put('/:automationId', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const { name, description, language, supportedLanguages, initialMessage, businessName, timezone, status } = body;
    const existing = await dbService.prisma.whatsAppAutomation.findUnique({
      where: { id: req.params.automationId },
      include: { tools: true },
    });
    if (!existing) return res.status(404).json({ error: 'Automation not found' });
    const previousOnboarding = existing.promptConfig?.onboarding || {};
    const onboarding = body.onboarding || {};
    const profile = {
      ...(previousOnboarding.businessProfile || {}),
      ...(onboarding.businessProfile || body.businessProfile || {}),
      businessName: businessName || onboarding.businessProfile?.businessName || body.businessProfile?.businessName || existing.businessName,
      industryLabel: onboarding.businessProfile?.industryLabel || body.businessProfile?.industryLabel || previousOnboarding.businessProfile?.industryLabel,
      description: description || onboarding.businessProfile?.description || body.businessProfile?.description || existing.description,
      language: language || onboarding.businessProfile?.language || existing.language,
      timezone: timezone || onboarding.businessProfile?.timezone || existing.timezone,
    };
    const capabilities = onboarding.capabilities || body.capabilities || previousOnboarding.capabilities || [];
    const knowledgeSources = onboarding.knowledgeSources || body.knowledgeSources || previousOnboarding.knowledgeSources || [];
    const suppliedTools = onboarding.tools || body.tools || previousOnboarding.tools || existing.tools;
    const tools = buildToolRows(capabilities, suppliedTools);
    const systemPrompt = body.systemPrompt || buildGeneratedPrompt(profile, capabilities, knowledgeSources, tools.filter((tool) => tool.enabled).map((tool) => tool.name));
    const setup = onboarding.setup || previousOnboarding.setup || {};
    const workspaceId = await resolveWorkspaceId(req);
    const automation = await dbService.prisma.$transaction(async (tx) => {
      const updated = await tx.whatsAppAutomation.updateMany({
        where: { id: req.params.automationId, workspaceId },
        data: {
          name: name || profile.businessName,
          description: description || profile.description || null,
          language: language || profile.language || 'en-US',
          supportedLanguages: Array.isArray(supportedLanguages) ? supportedLanguages : [language || profile.language || 'en-US'],
          systemPrompt,
          initialMessage: initialMessage || null,
          businessName: profile.businessName || null,
          timezone: timezone || profile.timezone || 'Asia/Kolkata',
          status: status || existing.status,
          industry: setup.industry || profile.industryLabel || existing.industry,
          businessPhone: setup.businessPhone || existing.businessPhone,
          businessEmail: setup.businessEmail || existing.businessEmail,
          websiteUrl: setup.websiteUrl || existing.websiteUrl,
          address: setup.address || existing.address,
          fallbackMode: setup.fallbackMode || existing.fallbackMode,
          fallbackMessage: setup.fallbackMessage || existing.fallbackMessage,
          handoffMessage: setup.handoffMessage || existing.handoffMessage,
          handoffKeywords: String(setup.handoffKeywords || existing.handoffKeywords.join(',')).split(',').map(value => value.trim()).filter(Boolean),
          tone: setup.tone || existing.tone,
          responseLength: setup.responseLength || existing.responseLength,
          setupStep: Number(setup.step || existing.setupStep),
          setupCompleted: Boolean(setup.setupCompleted || existing.setupCompleted),
          activatedAt: status === 'active' ? (existing.activatedAt || new Date()) : existing.activatedAt,
          behaviorConfig: setup.behaviorConfig || existing.behaviorConfig,
          capabilities: setup.capabilities || capabilities,
          promptConfig: {
            ...(existing.promptConfig || {}),
            ...body.promptConfig,
            onboarding: { ...previousOnboarding, ...onboarding, businessProfile: profile, capabilities, knowledgeSources, tools },
          },
        },
      });
      if (!updated.count) return null;
      await tx.whatsAppAutomationTool.deleteMany({ where: { automationId: req.params.automationId } });
      if (tools.length) await tx.whatsAppAutomationTool.createMany({ data: tools.map((tool) => ({ ...tool, automationId: req.params.automationId })) });
      await syncSetupRecords(tx, req.params.automationId, setup);
      return tx.whatsAppAutomation.findUnique({ where: { id: req.params.automationId }, include: { tools: true, autoReplies: true } });
    });
    if (!automation) return res.status(404).json({ error: 'Automation not found' });
    store.clearAutomation(req.params.automationId);
    res.json({ ok: true, automation });
  } catch (error) {
    console.error('[WhatsAppAutomation] update error:', error);
    res.status(500).json({ error: error.message || 'Failed to update WhatsApp automation' });
  }
});

router.delete('/:automationId', requireAdmin, async (req, res) => {
  const result = await dbService.prisma.whatsAppAutomation.deleteMany({ where: { id: req.params.automationId, workspaceId: req.user.workspaceId } });
  if (!result.count) return res.status(404).json({ error: 'Automation not found' });
  res.status(204).send();
});

router.post('/:automationId/connections', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const phoneNumber = String(body.phoneNumber || '').trim();
    if (!body.provider || !phoneNumber) return res.status(400).json({ error: 'provider and phoneNumber are required' });
    if (!['baileys', 'cloud_api', 'meta_cloud', 'meta'].includes(body.provider)) return res.status(400).json({ error: 'Unsupported provider' });
    const workspaceId = await resolveWorkspaceId(req);
    const automation = await dbService.prisma.whatsAppAutomation.findFirst({ where: { id: req.params.automationId, workspaceId } });
    if (!automation) return res.status(404).json({ error: 'Automation not found' });

    if (await findRoutingConflict(body)) {
      return res.status(409).json({ error: 'instanceId or phoneNumberId is already used by another connection' });
    }

    const existing = await dbService.prisma.whatsAppConnection.findUnique({
      where: { automationId_phoneNumber: { automationId: automation.id, phoneNumber } },
    });
    if (existing) {
      return res.status(409).json({
        error: 'This phone number is already connected to this automation.',
        connection: scrub(existing),
      });
    }

    const connection = await dbService.prisma.whatsAppConnection.create({
      data: {
        provider: body.provider,
        phoneNumber,
        phoneNumberId: body.phoneNumberId || null,
        businessId: body.businessId || null,
        instanceId: body.instanceId || null,
        ...encryptConnectionSecrets({ apiToken: body.apiToken || null, appSecret: body.appSecret || null }),
        verifyToken: body.verifyToken || null,
        credentials: body.credentials || null,
        automationId: automation.id,
      },
    });
    try {
      createWhatsAppAutomationProvider(connection);
    } catch (error) {
      await dbService.prisma.whatsAppConnection.delete({ where: { id: connection.id } });
      return res.status(400).json({ error: error.message });
    }
    res.status(201).json({ connection: scrub(connection) });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'This phone number is already connected to this automation.' });
    }
    console.error('[WhatsAppAutomation] connection create error:', error);
    res.status(500).json({ error: error.message || 'Failed to create WhatsApp connection' });
  }
});

router.put('/:automationId/connections/:connectionId', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const allowedFields = [
      'provider',
      'phoneNumber',
      'phoneNumberId',
      'businessId',
      'instanceId',
      'apiToken',
      'verifyToken',
      'appSecret',
      'credentials',
      'enabled',
    ];
    // '***' is the masked placeholder returned by scrub(); never persist it over a real secret
    const data = encryptConnectionSecrets(Object.fromEntries(
      allowedFields
        .filter((field) => Object.prototype.hasOwnProperty.call(body, field) && body[field] !== '***')
        .map((field) => [field, body[field]])
    ));

    if (data.provider && !['baileys', 'cloud_api', 'meta_cloud', 'meta'].includes(data.provider)) {
      return res.status(400).json({ error: 'Unsupported provider' });
    }
    if (data.phoneNumber !== undefined) {
      data.phoneNumber = String(data.phoneNumber).trim();
      if (!data.phoneNumber) return res.status(400).json({ error: 'phoneNumber cannot be empty' });
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No valid connection fields provided' });
    if (await findRoutingConflict(data, req.params.connectionId)) {
      return res.status(409).json({ error: 'instanceId or phoneNumberId is already used by another connection' });
    }

    const connection = await dbService.prisma.whatsAppConnection.updateMany({
      where: {
        id: req.params.connectionId,
        automationId: req.params.automationId,
        automation: { workspaceId: await resolveWorkspaceId(req) },
      },
      data,
    });
    if (!connection.count) return res.status(404).json({ error: 'Connection not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error('[WhatsAppAutomation] connection update error:', error);
    res.status(500).json({ error: error.message || 'Failed to update WhatsApp connection' });
  }
});

router.delete('/:automationId/connections/:connectionId', requireAdmin, async (req, res) => {
  const result = await dbService.prisma.whatsAppConnection.deleteMany({
    where: { id: req.params.connectionId, automationId: req.params.automationId, automation: { workspaceId: req.user.workspaceId } },
  });

  if (!result.count) return res.status(404).json({ error: 'Connection not found' });
  res.status(204).send();
});

router.get('/:automationId/connections/:connectionId/status', requireAdmin, async (req, res) => {
  const connection = await dbService.prisma.whatsAppConnection.findFirst({
    where: { id: req.params.connectionId, automationId: req.params.automationId, automation: { workspaceId: req.user.workspaceId } },
  });
  if (!connection) return res.status(404).json({ error: 'Connection not found' });
  try {
    const provider = createWhatsAppAutomationProvider(connection);
    res.json({ status: typeof provider.getStatus === 'function' ? provider.getStatus() : { status: 'configured' } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:automationId/sessions', requireAdmin, (req, res) => {
  res.json({ sessions: store.list().filter(session => session.automationId === req.params.automationId).map(({ conversationManager, ...session }) => ({ ...session, messageCount: conversationManager?.transcript?.length || 0 })) });
});

// ============================================
// LOGS API
// ============================================

router.get('/:automationId/logs', requireAdmin, async (req, res) => {
  try {
    const { WhatsAppAutomationLogService } = require('./logService');
    const { level, category, sessionId, since, limit } = req.query;
    const filters = {};
    if (level) filters.level = level;
    if (category) filters.category = category;
    if (sessionId) filters.sessionId = sessionId;
    if (since) filters.since = since;
    if (limit) filters.limit = parseInt(limit, 10);
    const logs = await WhatsAppAutomationLogService.query(req.params.automationId, filters);
    res.json({ logs });
  } catch (error) {
    console.error('[WhatsAppAutomation] logs query error:', error);
    res.status(500).json({ error: 'Failed to query logs' });
  }
});

router.get('/:automationId/logs/stats', requireAdmin, async (req, res) => {
  try {
    const { WhatsAppAutomationLogService } = require('./logService');
    const stats = await WhatsAppAutomationLogService.stats(req.params.automationId);
    res.json({ stats });
  } catch (error) {
    console.error('[WhatsAppAutomation] logs stats error:', error);
    res.status(500).json({ error: 'Failed to get log stats' });
  }
});

router.get('/:automationId/logs/recent', requireAdmin, async (req, res) => {
  try {
    const { WhatsAppAutomationLogService } = require('./logService');
    const { limit } = req.query;
    const logs = WhatsAppAutomationLogService.getRecentLogs(req.params.automationId, limit ? parseInt(limit, 10) : 100);
    res.json({ logs });
  } catch (error) {
    console.error('[WhatsAppAutomation] recent logs error:', error);
    res.status(500).json({ error: 'Failed to get recent logs' });
  }
});

// ============================================
// AUTO-REPLY RULES API
// ============================================

router.get('/:automationId/auto-replies', requireAdmin, async (req, res) => {
  try {
    const workspaceId = await resolveWorkspaceId(req);
    const automation = await dbService.prisma.whatsAppAutomation.findFirst({
      where: { id: req.params.automationId, workspaceId },
      select: { id: true },
    });
    if (!automation) return res.status(404).json({ error: 'Automation not found' });
    const rules = await dbService.prisma.whatsAppAutoReplyRule.findMany({
      where: { automationId: req.params.automationId },
      orderBy: { priority: 'asc' },
    });
    res.json({ rules });
  } catch (error) {
    if (error.code === 'P2021' || error.message?.includes('does not exist')) {
      return res.json({ rules: [] });
    }
    console.error('[WhatsAppAutomation] auto-replies list error:', error);
    res.status(500).json({ error: 'Failed to load auto-reply rules' });
  }
});

router.post('/:automationId/auto-replies', requireAdmin, async (req, res) => {
  try {
    const workspaceId = await resolveWorkspaceId(req);
    const automation = await dbService.prisma.whatsAppAutomation.findFirst({
      where: { id: req.params.automationId, workspaceId },
      select: { id: true },
    });
    if (!automation) return res.status(404).json({ error: 'Automation not found' });
    const body = req.body || {};
    const { name, triggerType, triggerKey, triggerValue, matchMode, response, responseConfig, responseType, priority, enabled } = body;
    const responseValue = responseConfig || response;
    if (!triggerType || !responseValue) {
      return res.status(400).json({ error: 'triggerType and response are required' });
    }
    const rule = await dbService.prisma.whatsAppAutoReplyRule.create({
      data: {
        automationId: req.params.automationId,
        name: name || 'Auto-reply',
        triggerType,
        triggerKey: triggerKey || null,
        triggerValue: triggerValue || null,
        matchMode: matchMode || 'exact',
        response: typeof responseValue === 'string' ? responseValue : JSON.stringify(responseValue),
        responseConfig: typeof responseValue === 'string' ? null : responseValue,
        responseType: responseType || 'text',
        priority: priority || 0,
        enabled: enabled !== false,
      },
    });
    res.status(201).json({ rule });
  } catch (error) {
    if (error.code === 'P2021' || error.message?.includes('does not exist')) {
      return res.status(500).json({ error: 'Auto-reply rules table not found. Please run database migration.' });
    }
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Auto-reply rule with this trigger already exists' });
    }
    console.error('[WhatsAppAutomation] auto-reply create error:', error);
    res.status(500).json({ error: error.message || 'Failed to create auto-reply rule' });
  }
});

router.put('/:automationId/auto-replies/:ruleId', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const allowedFields = ['name', 'triggerType', 'triggerKey', 'triggerValue', 'matchMode', 'response', 'responseConfig', 'responseType', 'priority', 'enabled'];
    const data = Object.fromEntries(
      allowedFields.filter(f => Object.prototype.hasOwnProperty.call(body, f)).map(f => [f, body[f]])
    );
    if (data.response && typeof data.response !== 'string') {
      data.response = JSON.stringify(data.response);
    }
    if (data.responseConfig && typeof data.responseConfig === 'string') {
      try { data.responseConfig = JSON.parse(data.responseConfig); } catch { data.responseConfig = null; }
    }
    const rule = await dbService.prisma.whatsAppAutoReplyRule.updateMany({
      where: { id: req.params.ruleId, automationId: req.params.automationId, automation: { workspaceId: req.user.workspaceId } },
      data,
    });
    if (!rule.count) return res.status(404).json({ error: 'Auto-reply rule not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error('[WhatsAppAutomation] auto-reply update error:', error);
    res.status(500).json({ error: error.message || 'Failed to update auto-reply rule' });
  }
});

router.delete('/:automationId/auto-replies/:ruleId', requireAdmin, async (req, res) => {
  try {
    const result = await dbService.prisma.whatsAppAutoReplyRule.deleteMany({
      where: { id: req.params.ruleId, automationId: req.params.automationId, automation: { workspaceId: req.user.workspaceId } },
    });
    if (!result.count) return res.status(404).json({ error: 'Auto-reply rule not found' });
    res.status(204).send();
  } catch (error) {
    console.error('[WhatsAppAutomation] auto-reply delete error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete auto-reply rule' });
  }
});

// ============================================
// MESSAGE STATS API
// ============================================

router.get('/:automationId/stats/messages', requireAdmin, async (req, res) => {
  try {
    const { connectionId } = req.query;
    const where = { automationId: req.params.automationId };
    if (connectionId) where.connectionId = connectionId;

    const sessions = await dbService.prisma.whatsAppAutomationSession.findMany({
      where,
      select: {
        messagesSent: true,
        messagesReceived: true,
        messagesFailed: true,
        llmCalls: true,
        toolCalls: true,
      },
    });

    const totals = sessions.reduce(
      (acc, s) => {
        acc.sent += s.messagesSent || 0;
        acc.received += s.messagesReceived || 0;
        acc.failed += s.messagesFailed || 0;
        acc.llmCalls += s.llmCalls || 0;
        acc.toolCalls += s.toolCalls || 0;
        return acc;
      },
      { sent: 0, received: 0, failed: 0, llmCalls: 0, toolCalls: 0 }
    );

    res.json({ stats: totals, sessionCount: sessions.length });
  } catch (error) {
    console.error('[WhatsAppAutomation] message stats error:', error);
    res.status(500).json({ error: 'Failed to get message stats' });
  }
});

function scrub(connection) {
  const { apiToken, appSecret, credentials, ...safe } = connection;
  const safeCredentials = credentials && typeof credentials === 'object'
    ? { ...credentials, apiToken: credentials.apiToken ? '***' : credentials.apiToken, accessToken: credentials.accessToken ? '***' : credentials.accessToken, appSecret: credentials.appSecret ? '***' : credentials.appSecret }
    : credentials;
  return {
    ...safe,
    credentials: safeCredentials,
    apiToken: apiToken ? '***' : null,
    appSecret: appSecret ? '***' : null,
  };
}

module.exports = router;
