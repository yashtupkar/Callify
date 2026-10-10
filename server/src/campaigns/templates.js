const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const MAX_PARAM_LENGTH = 1024;
const MAX_TEXT_LENGTH = 4096;

class MissingVariableError extends Error {
  constructor(placeholder) {
    super(`No value for variable "${placeholder}"`);
    this.code = 'MISSING_VARIABLE';
    this.placeholder = placeholder;
  }
}

class TemplateConfigError extends Error {
  constructor(message) {
    super(message);
    this.code = 'INVALID_TEMPLATE_CONFIG';
    this.status = 400;
  }
}

function extractPlaceholders(text) {
  const found = [];
  for (const match of String(text || '').matchAll(PLACEHOLDER)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

const sortPlaceholders = (list, positional) =>
  positional ? [...list].sort((a, b) => Number(a) - Number(b)) : list;

/**
 * Reduces a Meta message template to the parts campaigns can send. Templates using
 * features that need extra parameters we do not collect are flagged unsupported so the
 * UI never offers something the sender cannot build.
 */
function normalizeMetaTemplate(raw) {
  const components = Array.isArray(raw.components) ? raw.components : [];
  const positional = String(raw.parameter_format || 'POSITIONAL').toUpperCase() !== 'NAMED';
  const out = {
    id: raw.id || null,
    name: raw.name,
    language: raw.language,
    status: String(raw.status || '').toUpperCase(),
    category: String(raw.category || '').toUpperCase(),
    positional,
    header: null,
    body: { text: '', placeholders: [] },
    footer: null,
    buttons: [],
    supported: true,
    unsupportedReason: null,
  };
  const unsupported = (reason) => {
    if (out.supported) {
      out.supported = false;
      out.unsupportedReason = reason;
    }
  };

  if (out.category === 'AUTHENTICATION') unsupported('Authentication (OTP) templates cannot be used for campaigns');

  for (const component of components) {
    const type = String(component.type || '').toUpperCase();
    if (type === 'HEADER') {
      const format = String(component.format || 'TEXT').toUpperCase();
      if (format === 'TEXT') {
        const placeholders = sortPlaceholders(extractPlaceholders(component.text), positional);
        if (placeholders.length > 1) unsupported('Header supports at most one variable');
        out.header = { format, text: component.text || '', placeholders };
      } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(format)) {
        out.header = { format, text: '', placeholders: [] };
      } else {
        out.header = { format, text: '', placeholders: [] };
        unsupported(`Header format ${format} is not supported`);
      }
    } else if (type === 'BODY') {
      out.body = {
        text: component.text || '',
        placeholders: sortPlaceholders(extractPlaceholders(component.text), positional),
      };
    } else if (type === 'FOOTER') {
      out.footer = component.text || '';
    } else if (type === 'BUTTONS') {
      (component.buttons || []).forEach((button, index) => {
        const buttonType = String(button.type || '').toUpperCase();
        const urlPlaceholders = buttonType === 'URL' ? extractPlaceholders(button.url) : [];
        if (!['QUICK_REPLY', 'URL', 'PHONE_NUMBER'].includes(buttonType)) {
          unsupported(`Button type ${buttonType} is not supported`);
        }
        if (urlPlaceholders.length > 1) unsupported('URL buttons support at most one variable');
        out.buttons.push({ index, type: buttonType, text: button.text || '', url: button.url || null, hasVariable: urlPlaceholders.length === 1 });
      });
    } else {
      unsupported(`Template component ${type} is not supported`);
    }
  }
  return out;
}

function resolveSpec(spec, recipient) {
  if (!spec || typeof spec !== 'object') return null;
  let value = '';
  if (spec.source === 'static') value = spec.value;
  else if (spec.source === 'column') value = recipient?.variables?.[spec.value];
  else if (spec.source === 'name') value = recipient?.name;
  else if (spec.source === 'phone') value = recipient?.phone;
  value = String(value ?? '').trim();
  if (!value && spec.fallback) value = String(spec.fallback).trim();
  return value || null;
}

const sanitizeParam = (text) =>
  String(text).replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, MAX_PARAM_LENGTH);

function resolveAll(placeholders, specs, recipient) {
  return placeholders.map((placeholder) => {
    const value = resolveSpec(specs?.[placeholder], recipient);
    if (value === null) throw new MissingVariableError(placeholder);
    return { placeholder, value: sanitizeParam(value) };
  });
}

const textParams = (resolved, template) =>
  resolved.map(({ placeholder, value }) => ({
    type: 'text',
    text: value,
    ...(template.positional ? {} : { parameter_name: placeholder }),
  }));

/** Builds the Meta `components` array for one recipient. Throws MissingVariableError if a value is unresolved. */
function buildTemplateComponents(template, config, recipient) {
  const variableMap = config.variableMap || {};
  const components = [];

  if (template.header) {
    if (template.header.format === 'TEXT' && template.header.placeholders.length) {
      const resolved = resolveAll(template.header.placeholders, variableMap.header, recipient);
      components.push({ type: 'header', parameters: textParams(resolved, template) });
    } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.header.format)) {
      const key = template.header.format.toLowerCase();
      components.push({ type: 'header', parameters: [{ type: key, [key]: { link: config.headerMediaUrl } }] });
    }
  }
  if (template.body.placeholders.length) {
    const resolved = resolveAll(template.body.placeholders, variableMap.body, recipient);
    components.push({ type: 'body', parameters: textParams(resolved, template) });
  }
  for (const button of template.buttons) {
    if (button.type === 'URL' && button.hasVariable) {
      const value = resolveSpec(variableMap.buttons?.[String(button.index)], recipient);
      if (value === null) throw new MissingVariableError(`button ${button.index + 1}`);
      components.push({ type: 'button', sub_type: 'url', index: String(button.index), parameters: [{ type: 'text', text: sanitizeParam(value) }] });
    }
  }
  return components;
}

function fill(text, placeholders, resolved) {
  const values = new Map(resolved.map((r) => [r.placeholder, r.value]));
  return String(text || '').replace(PLACEHOLDER, (whole, key) => (values.has(key) ? values.get(key) : whole));
}

/** Human-readable rendering of the message a recipient would receive. */
function renderTemplatePreview(template, config, recipient) {
  const variableMap = config.variableMap || {};
  const bodyValues = resolveAll(template.body.placeholders, variableMap.body, recipient);
  const headerValues = template.header?.format === 'TEXT'
    ? resolveAll(template.header.placeholders, variableMap.header, recipient)
    : [];
  return {
    header: template.header
      ? (template.header.format === 'TEXT' ? fill(template.header.text, [], headerValues) : { mediaType: template.header.format, url: config.headerMediaUrl || null })
      : null,
    body: fill(template.body.text, [], bodyValues),
    footer: template.footer || null,
    buttons: template.buttons.map((b) => ({ type: b.type, text: b.text })),
  };
}

/** Checks a variable configuration against the template. Returns a list of human-readable problems. */
function validateTemplateConfig(template, config, { columns = [] } = {}) {
  const problems = [];
  const variableMap = config.variableMap || {};
  const checkSpec = (label, spec) => {
    if (!spec || typeof spec !== 'object') return problems.push(`Variable ${label} is not configured`);
    if (!['static', 'column', 'name', 'phone'].includes(spec.source)) return problems.push(`Variable ${label} has an invalid source`);
    if (spec.source === 'static' && !String(spec.value ?? '').trim() && !String(spec.fallback ?? '').trim()) problems.push(`Variable ${label} needs a value`);
    if (spec.source === 'column') {
      if (!spec.value) problems.push(`Variable ${label} needs a column`);
      else if (!columns.includes(spec.value)) problems.push(`Variable ${label} refers to unknown column "${spec.value}"`);
    }
    return null;
  };
  if (!template.supported) problems.push(template.unsupportedReason || 'Template is not supported');
  if (template.status !== 'APPROVED') problems.push(`Template is ${template.status || 'not approved'}; only APPROVED templates can be sent`);
  template.header?.placeholders?.forEach((p) => checkSpec(`{{${p}}} (header)`, variableMap.header?.[p]));
  template.body.placeholders.forEach((p) => checkSpec(`{{${p}}}`, variableMap.body?.[p]));
  template.buttons.filter((b) => b.hasVariable).forEach((b) => checkSpec(`for button "${b.text}"`, variableMap.buttons?.[String(b.index)]));
  if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.header?.format)) {
    let ok = false;
    try { ok = new URL(config.headerMediaUrl).protocol === 'https:'; } catch { ok = false; }
    if (!ok) problems.push('Header media requires a public https:// URL');
  }
  return problems;
}

/** Baileys: plain text only, with {{placeholder}} variables resolved from the same variable specs. */
function renderPlainText(text, config, recipient) {
  const placeholders = extractPlaceholders(text);
  const resolved = resolveAll(placeholders, (config.variableMap || {}).body, recipient);
  const rendered = fill(text, placeholders, resolved);
  if (rendered.length > MAX_TEXT_LENGTH) throw new TemplateConfigError(`Message exceeds ${MAX_TEXT_LENGTH} characters`);
  return rendered;
}

function validatePlainTextConfig(text, config, { columns = [] } = {}) {
  const problems = [];
  const value = String(text || '').trim();
  if (!value) problems.push('Message text is required');
  if (value.length > MAX_TEXT_LENGTH) problems.push(`Message exceeds ${MAX_TEXT_LENGTH} characters`);
  for (const p of extractPlaceholders(value)) {
    const spec = (config.variableMap || {}).body?.[p];
    if (!spec) problems.push(`Variable {{${p}}} is not configured`);
    else if (spec.source === 'column' && !columns.includes(spec.value)) problems.push(`Variable {{${p}}} refers to unknown column "${spec.value}"`);
    else if (spec.source === 'static' && !String(spec.value ?? '').trim() && !String(spec.fallback ?? '').trim()) problems.push(`Variable {{${p}}} needs a value`);
  }
  return problems;
}

module.exports = {
  MissingVariableError,
  TemplateConfigError,
  extractPlaceholders,
  normalizeMetaTemplate,
  resolveSpec,
  buildTemplateComponents,
  renderTemplatePreview,
  validateTemplateConfig,
  renderPlainText,
  validatePlainTextConfig,
};
