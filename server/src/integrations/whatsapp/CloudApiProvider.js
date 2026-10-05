/**
 * CloudApiProvider
 *
 * Implements WhatsAppProvider against Meta's WhatsApp Cloud API
 * (graph.facebook.com/v20.0). Reference:
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 *
 * Config:
 *   phoneNumberId   Meta phone number id (used as sender)
 *   businessId      WABA id
 *   apiToken        System user access token
 *   verifyToken     String used to echo the webhook challenge
 *   appSecret       Used to verify X-Hub-Signature-256
 */

const crypto = require('crypto');
const axios = require('axios');
const { WhatsAppProvider } = require('./WhatsAppProvider');

const GRAPH_BASE = 'https://graph.facebook.com/v20.0';

class CloudApiProvider extends WhatsAppProvider {
  constructor(config) {
    super(config);
    this.phoneNumberId = config.phoneNumberId;
    this.businessId = config.businessId;
    this.apiToken = config.apiToken;
    this.verifyToken = config.verifyToken;
    this.appSecret = config.appSecret;
    if (!this.phoneNumberId || !this.apiToken) {
      throw new Error('CloudApiProvider requires phoneNumberId and apiToken');
    }
  }

  verifyHandshake(req) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token) {
      if (token === this.verifyToken) {
        return { ok: true, challenge: String(challenge || '') };
      }
      return { ok: false, error: 'verify_token mismatch' };
    }
    return { ok: true };
  }

  verifyInbound(req) {
    if (!this.appSecret) return true; // dev mode
    const sigHeader = req.headers['x-hub-signature-256'];
    if (!sigHeader) return false;
    const expected = 'sha256=' + crypto
      .createHmac('sha256', this.appSecret)
      .update(req.rawBody || JSON.stringify(req.body || {}))
      .digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected));
    } catch (e) {
      return false;
    }
  }

  parseInbound(req) {
    const body = req.body || {};
    if (body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return [];

    const out = [];
    for (const entry of body.entry) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const messages = value.messages || [];
        const contacts = value.contacts || [];
        for (const m of messages) {
          const from = m.from;
          const ts = Number(m.timestamp) || Math.floor(Date.now() / 1000);
          const type = m.type || 'text';
          const id = m.id || `cloud-${ts}-${Math.random().toString(36).slice(2, 8)}`;
          const base = { providerMessageId: id, from, timestamp: ts };

          if (type === 'text') {
            out.push({ ...base, type: 'text', text: m.text?.body || '' });
          } else if (type === 'image') {
            out.push({
              ...base,
              type: 'image',
              media: {
                providerMediaId: m.image?.id,
                mime: m.image?.mime_type || 'image/jpeg',
                caption: m.image?.caption || '',
                sha256: m.image?.sha256,
              },
            });
          } else if (type === 'audio') {
            out.push({
              ...base,
              type: 'audio',
              media: {
                providerMediaId: m.audio?.id,
                mime: m.audio?.mime_type || 'audio/ogg',
                sha256: m.audio?.sha256,
              },
            });
          } else if (type === 'document') {
            out.push({
              ...base,
              type: 'document',
              media: {
                providerMediaId: m.document?.id,
                mime: m.document?.mime_type || 'application/octet-stream',
                filename: m.document?.filename,
                caption: m.document?.caption || '',
                sha256: m.document?.sha256,
              },
            });
          } else if (type === 'button') {
            out.push({ ...base, type: 'button', text: m.button?.text || '' });
          } else if (type === 'interactive') {
            const ir = m.interactive || {};
            const reply = ir.button_reply?.title || ir.list_reply?.title || '';
            out.push({ ...base, type: 'list', text: reply });
          } else {
            out.push({ ...base, type: 'unknown', text: '' });
          }

          // attach profile name if present
          const profile = contacts.find(c => c.wa_id === from);
          if (profile) out[out.length - 1].profileName = profile.profile?.name;
        }
      }
    }
    return out;
  }

  async _post(path, payload) {
    const res = await axios.post(`${GRAPH_BASE}${path}`, payload, {
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
    return res.data;
  }

  async _get(path, params = {}) {
    const res = await axios.get(`${GRAPH_BASE}${path}`, {
      headers: { Authorization: `Bearer ${this.apiToken}` },
      params,
      timeout: 30000,
    });
    return res.data;
  }

  async sendText(to, body) {
    return this._post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    });
  }

  async sendImage(to, url, caption) {
    return this._post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link: url, caption: caption || undefined },
    });
  }

  async sendDocument(to, url, filename) {
    return this._post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { link: url, filename: filename || undefined },
    });
  }

  async sendTemplate(to, templateName, languageCode, parameters = []) {
    return this._post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode || 'en' },
        components: parameters.length
          ? [{ type: 'body', parameters: parameters.map(text => ({ type: 'text', text })) }]
          : undefined,
      },
    });
  }

  async downloadMedia(mediaRef) {
    if (!mediaRef || !mediaRef.providerMediaId) {
      throw new Error('CloudApiProvider.downloadMedia requires providerMediaId');
    }
    // Step 1: get media URL
    const meta = await this._get(`/${mediaRef.providerMediaId}`);
    const mediaUrl = meta.url;
    if (!mediaUrl) throw new Error('Meta did not return a media URL');
    // Step 2: download bytes with auth
    const res = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${this.apiToken}` },
      timeout: 30000,
    });
    return { buffer: Buffer.from(res.data), mime: mediaRef.mime || res.headers['content-type'] || 'application/octet-stream' };
  }

  /**
   * Mark an inbound message as read (best-effort UX touch).
   */
  async markAsRead(messageId) {
    return this._post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }
}

module.exports = { CloudApiProvider };
