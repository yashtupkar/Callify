const axios = require('axios');
/**
 * AutoReplyService
 *
 * Triggers deterministic, non-LLM auto-replies based on user interactions:
 *   - button presses (by button id)
 *   - list row selections (by row id)
 *   - keyword matches (exact, contains, prefix, regex)
 *   - flow replies
 *   - "always" catch-all rules
 *
 * Rules are evaluated in priority order (lower number = higher priority).
 * The first matching rule wins.
 */

const { normalizeWhatsAppResponse } = require('./responseNormalizer');

const MATCH_MODES = {
  exact: (input, value) => input === value,
  contains: (input, value) => input.includes(value),
  prefix: (input, value) => input.startsWith(value),
  regex: (input, value) => {
    try {
      return new RegExp(value, 'i').test(input);
    } catch {
      return false;
    }
  },
};


const MEDIA_RULES = {
  image: { types: ['image/jpeg', 'image/png'], max: 5 * 1024 * 1024 },
  video: { types: ['video/mp4', 'video/3gpp'], max: 16 * 1024 * 1024 },
  document: { types: null, max: 100 * 1024 * 1024 },
};

// Meta downloads the media itself; it must be a direct, public file of a supported type.
async function probeMediaUrl(kind, url) {
  const rule = MEDIA_RULES[kind];
  try {
    const res = await axios.get(url, {
      responseType: 'stream',
      timeout: 8000,
      maxRedirects: 3,
      headers: { Range: 'bytes=0-0' },
      validateStatus: () => true,
    });
    res.data.destroy();
    if (res.status >= 400) return `Media URL returned HTTP ${res.status}; it must be publicly accessible`;
    const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (type.startsWith('text/')) return 'Media URL is a web page, not a direct file';
    if (rule.types && !rule.types.includes(type)) return `Unsupported ${kind} type "${type}" (use ${rule.types.join(' or ')})`;
    const range = String(res.headers['content-range'] || '').split('/')[1];
    const size = Number(range || res.headers['content-length']);
    if (size && size > rule.max) return `Media file is too large (${Math.round(size / 1048576)} MB)`;
    return null;
  } catch (err) {
    return `Media URL could not be reached: ${err.message}`;
  }
}

class AutoReplyService {
  constructor(rules = []) {
    this.rules = rules
      .filter((r) => r.enabled)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  }

  /**
   * Try to find a matching auto-reply for the given interaction.
   * @param {object} opts
   * @param {string} opts.triggerType - button_press | list_row | keyword | flow_reply | always
   * @param {string} opts.triggerKey - button id, row id, keyword trigger key
   * @param {string} opts.triggerValue - the actual text/value to match against
   * @param {string} opts.userText - raw user text (for keyword matching)
   * @returns {{ matched: boolean, rule?: object, response?: object }}
   */
  /**
   * A rule may carry an optional `attachment` ({ kind: image|video|document|link, url })
   * that goes with any response type. Where WhatsApp supports a media header
   * (button / website-link messages on Cloud API) it is merged into the message;
   * otherwise it is sent as a separate message just before it.
   * @returns {{ pre: object[], response: object }}
   */
  async withAttachment(rule, response, supportsHeaderMedia = false, log = null) {
    let config = rule.responseConfig;
    if (!config && rule.response) {
      try { config = typeof rule.response === 'string' ? JSON.parse(rule.response) : rule.response; } catch { config = null; }
    }
    const att = config?.attachment;
    const url = String(att?.url || '').trim();
    if (!att || !url || !['image', 'video', 'document', 'link'].includes(att.kind)) {
      return { pre: [], response };
    }
    if (att.kind !== 'link') {
      const problem = await probeMediaUrl(att.kind, url);
      if (problem) {
        console.warn('[AutoReply] Attachment skipped:', problem, url);
        if (log) await log.warn('auto_reply', 'attachment_skipped', problem, { url });
        return { pre: [], response };
      }
    }
    if (att.kind === 'link') {
      const key = response._type === 'text' ? 'text' : 'body';
      if (response[key] === undefined) return { pre: [], response };
      return { pre: [], response: { ...response, [key]: `${response[key]}\n${url}`.slice(0, 1024) } };
    }
    if (supportsHeaderMedia && ['button', 'cta_url'].includes(response._type) && response.header === undefined) {
      return { pre: [], response: { ...response, headerMedia: { type: att.kind, url } } };
    }
    if (response._type === 'media') return { pre: [], response };
    const media = normalizeWhatsAppResponse({ _type: 'media', mediaType: att.kind, url, caption: '' });
    return { pre: media._type === 'media' ? [media] : [], response };
  }

  hasFirstMessageRule() {
    return this.rules.some((r) => r.triggerType === 'first_message');
  }

  match({ triggerType, triggerKey, triggerValue, userText, isFirstMessage = false }) {
    // Welcome rules answer a contact's very first message, whatever it says.
    if (isFirstMessage) {
      const welcome = this.rules.find((r) => r.triggerType === 'first_message');
      if (welcome) return { matched: true, rule: welcome, response: this.buildResponse(welcome) };
    }
    for (const rule of this.rules) {
      if (rule.triggerType === 'first_message') continue;
      if (rule.triggerType !== triggerType && rule.triggerType !== 'always') continue;

      if (rule.triggerType === 'always') {
        return { matched: true, rule, response: this.buildResponse(rule) };
      }

      const matcher = MATCH_MODES[rule.matchMode] || MATCH_MODES.exact;
      // Interactive rules are stable by provider ID; titles can change with
      // localization. Support triggerValue as a title fallback for old rules.
      const values = triggerType === 'keyword'
        ? [userText || '']
        : ['button_press', 'list_row'].includes(triggerType)
          ? [triggerKey || '', triggerValue || '']
          : [triggerValue || triggerKey || ''];
      const needle = rule.triggerValue || rule.triggerKey || '';
      if (values.some((value) => matcher(value, needle))) {
        return { matched: true, rule, response: this.buildResponse(rule) };
      }
    }
    return { matched: false };
  }

  buildResponse(rule) {
    const raw = rule.response;
    if (rule.responseType === 'text') {
      return normalizeWhatsAppResponse({ _type: 'text', text: String(raw) });
    }
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return normalizeWhatsAppResponse(parsed);
    } catch {
      return normalizeWhatsAppResponse({ _type: 'text', text: String(raw) });
    }
  }
}

module.exports = { AutoReplyService, MATCH_MODES };