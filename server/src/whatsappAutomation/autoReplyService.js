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
  exact: (input, value) => String(input || '').trim().toLowerCase() === String(value || '').trim().toLowerCase(),
  contains: (input, value) => String(input || '').toLowerCase().includes(String(value || '').trim().toLowerCase()),
  prefix: (input, value) => String(input || '').toLowerCase().startsWith(String(value || '').trim().toLowerCase()),
  starts_with: (input, value) => String(input || '').toLowerCase().startsWith(String(value || '').trim().toLowerCase()),
  regex: (input, value) => {
    try {
      return new RegExp(String(value || '').trim(), 'i').test(String(input || ''));
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

// Meta / Baileys download or stream the media; it must be a direct, public file of a supported type.
async function probeMediaUrl(kind, url) {
  const rule = MEDIA_RULES[kind];
  try {
    let res = await axios.get(url, {
      responseType: 'stream',
      timeout: 8000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        Range: 'bytes=0-1024',
      },
      validateStatus: () => true,
    });
    // Some static file servers/CDNs reject range requests with 416 or 400. Retry without Range header.
    if (res.status >= 400) {
      if (res.data?.destroy) res.data.destroy();
      res = await axios.get(url, {
        responseType: 'stream',
        timeout: 8000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        },
        validateStatus: () => true,
      });
    }
    if (res.data?.destroy) res.data.destroy();
    if (res.status >= 400) return `Media URL returned HTTP ${res.status}; it must be publicly accessible`;
    const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (type.startsWith('text/html')) return 'Media URL is a web page, not a direct file';
    if (rule.types && !rule.types.includes(type) && !type.startsWith('image/')) return `Unsupported ${kind} type "${type}" (use ${rule.types.join(' or ')})`;
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

  hasAlwaysRule() {
    return this.rules.some((r) => r.triggerType === 'always');
  }

  match({ triggerType, triggerKey, triggerValue, userText, isFirstMessage = false }) {
    const cleanUserText = (userText || '').trim().toLowerCase();
    const GREETINGS = new Set(['hi', 'hello', 'hey', 'start', 'restart', 'menu', 'welcome', 'namaste', 'hola']);
    const isGreeting = GREETINGS.has(cleanUserText);

    // Welcome rules answer a contact's first message
    if (isFirstMessage) {
      const welcome = this.rules.find((r) => r.triggerType === 'first_message');
      if (welcome) return { matched: true, rule: welcome, response: this.buildResponse(welcome) };
    }
    for (const rule of this.rules) {
      if (rule.triggerType === 'first_message') continue;

      // 'always' rules match every message regardless of trigger type (including media/location)
      if (rule.triggerType === 'always') {
        return { matched: true, rule, response: this.buildResponse(rule) };
      }

      // Specific trigger rules only run when the message type matches
      if (!triggerType || rule.triggerType !== triggerType) continue;

      const matcher = MATCH_MODES[rule.matchMode] || MATCH_MODES.exact;
      // Interactive rules are stable by provider ID; titles can change with
      // localization. Support triggerValue as a title fallback for old rules.
      const values = triggerType === 'keyword'
        ? [userText || '']
        : ['button_press', 'list_row'].includes(triggerType)
          ? [
              triggerKey || '',
              triggerValue || '',
              String(triggerKey || '').replace(/[-_]+/g, ' '),
              String(triggerValue || '').replace(/[-_]+/g, '_'),
              String(triggerKey || '').replace(/[-_]+/g, '-'),
            ].filter(Boolean)
          : [triggerValue || triggerKey || ''];
      const needle = (rule.triggerValue || rule.triggerKey || '').trim();
      const needles = needle.includes(',') ? needle.split(',').map((s) => s.trim()) : [needle];
      if (values.some((value) => needles.some((n) => matcher(value, n)))) {
        return { matched: true, rule, response: this.buildResponse(rule) };
      }
    }
    return { matched: false };
  }

  buildResponse(rule) {
    let raw = rule.responseConfig || rule.response;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        // Leave raw as string
      }
    }
    if (rule.responseType === 'text') {
      const textVal = typeof raw === 'object' && raw ? (raw.text || raw.body || '') : String(raw || '');
      return normalizeWhatsAppResponse({ _type: 'text', text: textVal });
    }
    if (typeof raw === 'object' && raw !== null) {
      return normalizeWhatsAppResponse(raw);
    }
    return normalizeWhatsAppResponse({ _type: 'text', text: String(raw || '') });
  }
}

module.exports = { AutoReplyService, MATCH_MODES };