/**
 * responseNormalizer.js
 *
 * Normalizes and validates AI-generated responses for WhatsApp channels.
 * Supports all standardized response types:
 * - text
 * - button
 * - list
 * - cta_url
 * - media (image, video, document)
 * - template
 * - flow
 * - location
 * - handoff
 *
 * All AI output is treated as untrusted input and validated before reaching
 * provider or external APIs. Safe fallbacks are provided when validation fails.
 */

const VALID_RESPONSE_TYPES = new Set([
  'text',
  'button',
  'list',
  'cta_url',
  'media',
  'template',
  'flow',
  'location',
  'handoff',
]);

const VALID_MEDIA_TYPES = new Set(['image', 'video', 'document']);

/**
 * Attempts to extract and parse a single JSON object from raw LLM text output.
 * Handles markdown code fences (```json ... ```), extra whitespace, or leading/trailing text.
 *
 * @param {string} raw
 * @returns {object|null} Parsed JSON object, or null if parsing fails.
 */
function extractJsonFromText(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Direct parse
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed);
    } catch (_) {
      // Fall through to regex extraction
    }
  }

  // Remove markdown code fences like ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (_) {
      // Fall through to brace search
    }
  }

  // Find outermost balanced curly braces
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {
      // Failed to parse candidate
    }
  }

  return null;
}

/**
 * Validates whether a URL is a safe HTTP or HTTPS URL.
 *
 * @param {string} urlStr
 * @returns {boolean}
 */
function isValidHttpUrl(urlStr) {
  if (typeof urlStr !== 'string' || !urlStr.trim()) return false;
  try {
    const parsed = new URL(urlStr.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

/**
 * Normalizes and validates an AI response object.
 * Returns a strictly valid normalized response object.
 *
 * @param {object|string} input - Raw AI string response or pre-parsed object.
 * @returns {object} Normalized response object with valid `_type`.
 */
function normalizeWhatsAppResponse(input) {
  if (!input) {
    return {
      _type: 'text',
      text: "I'm sorry, I couldn't process that request. How else can I help?",
    };
  }

  let obj = null;
  if (typeof input === 'string') {
    obj = extractJsonFromText(input);
    if (!obj) {
      // Treat plain text string as a plain text response
      const text = input.trim();
      return {
        _type: 'text',
        text: text || "I'm sorry, I couldn't process that request. How else can I help?",
      };
    }
  } else if (typeof input === 'object' && input !== null) {
    obj = input;
  } else {
    return {
      _type: 'text',
      text: String(input),
    };
  }

  const rawType = String(obj._type || '').trim().toLowerCase();

  // If missing or unsupported _type, check if it has recognizable fields or fallback to text
  if (!VALID_RESPONSE_TYPES.has(rawType)) {
    if (typeof obj.text === 'string' && obj.text.trim()) {
      return { _type: 'text', text: obj.text.trim() };
    }
    if (typeof obj.body === 'string' && obj.body.trim()) {
      return { _type: 'text', text: obj.body.trim() };
    }
    if (typeof obj.message === 'string' && obj.message.trim()) {
      return { _type: 'text', text: obj.message.trim() };
    }
    return {
      _type: 'text',
      text: "I'm sorry, I couldn't process that request. How else can I help?",
    };
  }

  switch (rawType) {
    case 'text':
      return validateTextResponse(obj);

    case 'button':
      return validateButtonResponse(obj);

    case 'list':
      return validateListResponse(obj);

    case 'cta_url':
      return validateCtaUrlResponse(obj);

    case 'media':
      return validateMediaResponse(obj);

    case 'template':
      return validateTemplateResponse(obj);

    case 'flow':
      return validateFlowResponse(obj);

    case 'location':
      return validateLocationResponse(obj);

    case 'handoff':
      return validateHandoffResponse(obj);

    default:
      return {
        _type: 'text',
        text: "I'm sorry, I couldn't process that request. How else can I help?",
      };
  }
}

/**
 * Validates text response.
 */
function validateTextResponse(obj) {
  const text = typeof obj.text === 'string' ? obj.text.trim() : (obj.body || '');
  if (!text) {
    return {
      _type: 'text',
      text: "I'm sorry, I couldn't process that request. How else can I help?",
    };
  }
  return {
    _type: 'text',
    text: String(text).slice(0, 4096),
  };
}

/**
 * Validates button response (Meta reply buttons, max 3).
 */
function validateButtonResponse(obj) {
  const body = typeof obj.body === 'string' ? obj.body.trim() : (obj.text || '');
  if (!body) {
    return {
      _type: 'text',
      text: "Please let us know how we can help you.",
    };
  }

  const rawButtons = Array.isArray(obj.buttons) ? obj.buttons : [];
  const validButtons = [];
  const seenIds = new Set();

  for (const b of rawButtons) {
    if (!b || typeof b !== 'object') continue;
    const title = String(b.title || b.text || '').trim();
    let id = String(b.id || b.payload || '').trim();
    if (!title) continue;

    // Generate safe id if missing
    if (!id) {
      id = title.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 20);
    }
    // Ensure uniqueness
    let uniqueId = id;
    let counter = 1;
    while (seenIds.has(uniqueId)) {
      uniqueId = `${id}_${counter++}`;
    }
    seenIds.add(uniqueId);

    validButtons.push({
      id: uniqueId.slice(0, 256),
      title: title.slice(0, 20),
    });

    if (validButtons.length === 3) break; // Max 3 buttons
  }

  // If no valid buttons could be built, fall back to plain text
  if (validButtons.length === 0) {
    return {
      _type: 'text',
      text: body.slice(0, 4096),
    };
  }

  const result = {
    _type: 'button',
    body: body.slice(0, 1024),
    buttons: validButtons,
  };

  if (obj.header && typeof obj.header === 'string') {
    result.header = obj.header.trim().slice(0, 60);
  }
  if (obj.footer && typeof obj.footer === 'string') {
    result.footer = obj.footer.trim().slice(0, 60);
  }

  return result;
}

/**
 * Validates list message response (Meta interactive list menu, max 10 sections/10 rows total).
 */
function validateListResponse(obj) {
  const body = typeof obj.body === 'string' ? obj.body.trim() : (obj.text || '');
  if (!body) {
    return {
      _type: 'text',
      text: "Please select an option from our services.",
    };
  }

  const buttonLabel = String(obj.buttonLabel || obj.button || 'View Options').trim().slice(0, 20);
  const rawSections = Array.isArray(obj.sections) ? obj.sections : [];
  const validSections = [];
  const seenRowIds = new Set();
  let totalRows = 0;

  for (const sec of rawSections) {
    if (!sec || typeof sec !== 'object') continue;
    const title = String(sec.title || 'Options').trim().slice(0, 24);
    const rawRows = Array.isArray(sec.rows) ? sec.rows : [];
    const validRows = [];

    for (const r of rawRows) {
      if (!r || typeof r !== 'object') continue;
      const rowTitle = String(r.title || r.text || '').trim();
      let rowId = String(r.id || '').trim();
      if (!rowTitle) continue;

      if (!rowId) {
        rowId = rowTitle.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 20);
      }
      let uniqueId = rowId;
      let counter = 1;
      while (seenRowIds.has(uniqueId)) {
        uniqueId = `${rowId}_${counter++}`;
      }
      seenRowIds.add(uniqueId);

      const rowObj = {
        id: uniqueId.slice(0, 200),
        title: rowTitle.slice(0, 24),
      };
      if (r.description && typeof r.description === 'string') {
        rowObj.description = r.description.trim().slice(0, 72);
      }
      validRows.push(rowObj);
      totalRows++;

      if (totalRows >= 10) break; // Meta limit: 10 rows total across all sections
    }

    if (validRows.length > 0) {
      validSections.push({
        title,
        rows: validRows,
      });
    }

    if (totalRows >= 10 || validSections.length >= 10) break;
  }

  if (validSections.length === 0) {
    return {
      _type: 'text',
      text: body.slice(0, 4096),
    };
  }

  const result = {
    _type: 'list',
    body: body.slice(0, 1024),
    buttonLabel: buttonLabel || 'View Options',
    sections: validSections,
  };

  if (obj.header && typeof obj.header === 'string') {
    result.header = obj.header.trim().slice(0, 60);
  }
  if (obj.footer && typeof obj.footer === 'string') {
    result.footer = obj.footer.trim().slice(0, 60);
  }

  return result;
}

/**
 * Validates CTA URL interactive response.
 */
function validateCtaUrlResponse(obj) {
  const body = typeof obj.body === 'string' ? obj.body.trim() : (obj.text || '');
  const button = obj.button || {};
  const title = String(button.title || button.display_text || 'Visit Link').trim().slice(0, 20);
  const url = String(button.url || obj.url || '').trim();

  // Validate URL protocol
  if (!isValidHttpUrl(url)) {
    return {
      _type: 'text',
      text: body || "I can help you with that. Please contact our team for the next step.",
    };
  }

  const result = {
    _type: 'cta_url',
    body: (body || 'Please click the button below to continue:').slice(0, 1024),
    button: {
      title: title || 'Visit Link',
      url,
    },
  };

  if (obj.header && typeof obj.header === 'string') {
    result.header = obj.header.trim().slice(0, 60);
  }
  if (obj.footer && typeof obj.footer === 'string') {
    result.footer = obj.footer.trim().slice(0, 60);
  }

  return result;
}

/**
 * Validates media response (image, video, document).
 */
function validateMediaResponse(obj) {
  const rawMediaType = String(obj.mediaType || obj.type || 'image').trim().toLowerCase();
  const mediaType = VALID_MEDIA_TYPES.has(rawMediaType) ? rawMediaType : 'image';
  const url = typeof obj.url === 'string' ? obj.url.trim() : '';
  const mediaId = typeof obj.mediaId === 'string' ? obj.mediaId.trim() : (obj.id || '');
  const caption = typeof obj.caption === 'string' ? obj.caption.trim().slice(0, 1024) : undefined;
  const filename = typeof obj.filename === 'string' ? obj.filename.trim().slice(0, 255) : undefined;

  // Must have either a valid HTTP URL or a provider media ID
  if (!mediaId && (!url || !isValidHttpUrl(url))) {
    return {
      _type: 'text',
      text: caption || "Here is the information you requested. Please let us know if you need further details.",
    };
  }

  return {
    _type: 'media',
    mediaType,
    ...(url ? { url } : {}),
    ...(mediaId ? { mediaId } : {}),
    ...(caption ? { caption } : {}),
    ...(filename ? { filename } : {}),
  };
}

/**
 * Validates template response.
 */
function validateTemplateResponse(obj) {
  const name = typeof obj.name === 'string' ? obj.name.trim() : (obj.templateName || '');
  if (!name) {
    return {
      _type: 'text',
      text: "I'm sorry, I couldn't process the template notification. How else can I help?",
    };
  }

  let language = 'en_US';
  if (typeof obj.language === 'string') {
    language = obj.language.trim();
  } else if (obj.language && typeof obj.language.code === 'string') {
    language = obj.language.code.trim();
  }

  return {
    _type: 'template',
    name,
    language,
    parameters: obj.parameters || obj.params || {},
    ...(Array.isArray(obj.components) ? { components: obj.components } : {}),
  };
}

/**
 * Validates flow response.
 */
function validateFlowResponse(obj) {
  const flowId = typeof obj.flowId === 'string' ? obj.flowId.trim() : (obj.id || '');
  const body = typeof obj.body === 'string' ? obj.body.trim() : (obj.text || '');
  const cta = typeof obj.cta === 'string' ? obj.cta.trim().slice(0, 20) : 'Start';

  if (!flowId) {
    return {
      _type: 'text',
      text: body || "Please let us know how we can help you.",
    };
  }

  const result = {
    _type: 'flow',
    flowId,
    cta: cta || 'Start',
    body: (body || 'Please complete the form below.').slice(0, 1024),
  };

  if (obj.screen && typeof obj.screen === 'string') result.screen = obj.screen.trim();
  if (obj.data && typeof obj.data === 'object') result.data = obj.data;
  if (obj.flowToken && typeof obj.flowToken === 'string') result.flowToken = obj.flowToken.trim();
  if (obj.header && typeof obj.header === 'string') result.header = obj.header.trim().slice(0, 60);
  if (obj.footer && typeof obj.footer === 'string') result.footer = obj.footer.trim().slice(0, 60);

  return result;
}

/**
 * Validates location response.
 */
function validateLocationResponse(obj) {
  const lat = Number(obj.latitude ?? obj.lat);
  const lng = Number(obj.longitude ?? obj.lng);

  if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    const textDesc = [obj.name, obj.address].filter(Boolean).join(', ');
    return {
      _type: 'text',
      text: textDesc ? `Our location: ${textDesc}` : "Please contact our team for location details.",
    };
  }

  const result = {
    _type: 'location',
    latitude: lat,
    longitude: lng,
  };

  if (obj.name && typeof obj.name === 'string') result.name = obj.name.trim().slice(0, 100);
  if (obj.address && typeof obj.address === 'string') result.address = obj.address.trim().slice(0, 255);

  return result;
}

/**
 * Validates human handoff response.
 */
function validateHandoffResponse(obj) {
  const message = typeof obj.message === 'string' ? obj.message.trim() : (obj.text || obj.body || '');
  return {
    _type: 'handoff',
    message: message || "I'll connect you with a team member. Please wait a moment.",
  };
}

/**
 * Converts any normalized response into clean plain text for fallback display or text-only channels.
 *
 * @param {object} response
 * @returns {string} Plain text representation
 */
function extractPlainText(response) {
  if (!response || typeof response !== 'object') return String(response || '');

  switch (response._type) {
    case 'text':
      return response.text || '';

    case 'button': {
      const parts = [];
      if (response.header) parts.push(`*${response.header}*`);
      if (response.body) parts.push(response.body);
      if (Array.isArray(response.buttons) && response.buttons.length > 0) {
        parts.push(response.buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n'));
      }
      if (response.footer) parts.push(`_${response.footer}_`);
      return parts.join('\n\n');
    }

    case 'list': {
      const parts = [];
      if (response.header) parts.push(`*${response.header}*`);
      if (response.body) parts.push(response.body);
      if (Array.isArray(response.sections)) {
        for (const sec of response.sections) {
          if (sec.title) parts.push(`*${sec.title}*`);
          if (Array.isArray(sec.rows)) {
            parts.push(
              sec.rows
                .map(r => `• ${r.title}${r.description ? ` - ${r.description}` : ''}`)
                .join('\n')
            );
          }
        }
      }
      if (response.footer) parts.push(`_${response.footer}_`);
      return parts.join('\n\n');
    }

    case 'cta_url': {
      const parts = [];
      if (response.header) parts.push(`*${response.header}*`);
      if (response.body) parts.push(response.body);
      if (response.button?.url) {
        parts.push(`${response.button.title || 'Link'}: ${response.button.url}`);
      }
      if (response.footer) parts.push(`_${response.footer}_`);
      return parts.join('\n\n');
    }

    case 'media': {
      const caption = response.caption ? ` ${response.caption}` : '';
      const url = response.url ? ` (${response.url})` : '';
      return `[${response.mediaType || 'Media'}]${caption}${url}`.trim();
    }

    case 'template': {
      return `[Template: ${response.name}]`;
    }

    case 'flow': {
      const parts = [];
      if (response.header) parts.push(`*${response.header}*`);
      if (response.body) parts.push(response.body);
      parts.push(`[Form / Flow: ${response.cta || 'Start'}]`);
      if (response.footer) parts.push(`_${response.footer}_`);
      return parts.join('\n\n');
    }

    case 'location': {
      const details = [response.name, response.address].filter(Boolean).join(', ');
      const coords = `(Lat: ${response.latitude}, Lng: ${response.longitude})`;
      return `📍 Location: ${details ? `${details} ` : ''}${coords}`;
    }

    case 'handoff':
      return response.message || "Connecting you with our team...";

    default:
      return response.text || response.body || response.message || '';
  }
}

module.exports = {
  normalizeWhatsAppResponse,
  extractJsonFromText,
  extractPlainText,
  isValidHttpUrl,
  VALID_RESPONSE_TYPES,
  VALID_MEDIA_TYPES,
};
