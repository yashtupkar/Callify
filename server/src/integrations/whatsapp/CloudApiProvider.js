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

class CloudApiProvider extends WhatsAppProvider {
  constructor(config = {}) {
    super(config);
    this.phoneNumberId = config.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.businessId = config.businessId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    this.apiToken = config.apiToken || process.env.WHATSAPP_ACCESS_TOKEN;
    this.verifyToken = config.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN;
    this.appSecret = config.appSecret || process.env.WHATSAPP_APP_SECRET;

    let ver = config.apiVersion || process.env.WHATSAPP_API_VERSION || 'v20.0';
    if (!ver.startsWith('v')) ver = 'v' + ver;
    this.apiVersion = ver;
    this.graphBase = `https://graph.facebook.com/${this.apiVersion}`;

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

  /**
   * Parse inbound messages from Meta Cloud API webhook.
   * Normalizes text, media, interactive (button_reply, list_reply, flow_reply),
   * template quick replies, and location messages.
   *
   * @param {object} req - Express request
   * @returns {Array<object>} Normalized messages
   */
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
              text: m.image?.caption || '',
            });
          } else if (type === 'video') {
            out.push({
              ...base,
              type: 'video',
              media: {
                providerMediaId: m.video?.id,
                mime: m.video?.mime_type || 'video/mp4',
                caption: m.video?.caption || '',
                sha256: m.video?.sha256,
              },
              text: m.video?.caption || '',
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
              text: m.document?.caption || m.document?.filename || '',
            });
          } else if (type === 'button') {
            // Template quick-reply button
            const title = m.button?.text || '';
            const payload = m.button?.payload || title;
            out.push({
              ...base,
              type: 'interactive_response',
              interactionType: 'quick_reply',
              id: payload,
              title,
              text: title,
            });
          } else if (type === 'interactive') {
            const ir = m.interactive || {};
            if (ir.type === 'button_reply' || ir.button_reply) {
              const reply = ir.button_reply || {};
              out.push({
                ...base,
                type: 'interactive_response',
                interactionType: 'button_reply',
                id: reply.id || '',
                title: reply.title || '',
                text: reply.title || reply.id || '',
              });
            } else if (ir.type === 'list_reply' || ir.list_reply) {
              const reply = ir.list_reply || {};
              out.push({
                ...base,
                type: 'interactive_response',
                interactionType: 'list_reply',
                id: reply.id || '',
                title: reply.title || '',
                description: reply.description || '',
                text: reply.title || reply.id || '',
              });
            } else if (ir.type === 'nfm_reply' || ir.nfm_reply) {
              // Flow completion response
              const reply = ir.nfm_reply || {};
              out.push({
                ...base,
                type: 'interactive_response',
                interactionType: 'flow_reply',
                name: reply.name,
                body: reply.body,
                responseJson: reply.response_json,
                text: reply.body || '[Flow completed]',
              });
            } else {
              out.push({ ...base, type: 'unknown', text: '' });
            }
          } else if (type === 'location') {
            out.push({
              ...base,
              type: 'location',
              location: {
                latitude: m.location?.latitude,
                longitude: m.location?.longitude,
                name: m.location?.name || '',
                address: m.location?.address || '',
              },
              text: m.location?.name || m.location?.address || `Lat: ${m.location?.latitude}, Lng: ${m.location?.longitude}`,
            });
          } else {
            out.push({ ...base, type: 'unknown', text: '' });
          }

          // Attach customer profile name if present
          const profile = contacts.find((c) => c.wa_id === from);
          if (profile && out.length > 0) {
            out[out.length - 1].profileName = profile.profile?.name;
          }
        }
      }
    }
    return out;
  }

  /**
   * Parse status updates (sent, delivered, read, failed) from Meta webhook.
   *
   * @param {object} req - Express request
   * @returns {Array<object>}
   */
  parseStatusUpdates(req) {
    const body = req.body || {};
    if (body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return [];

    const statuses = [];
    for (const entry of body.entry) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const rawStatuses = value.statuses || [];
        for (const s of rawStatuses) {
          statuses.push({
            providerMessageId: s.id,
            status: s.status, // 'sent' | 'delivered' | 'read' | 'failed'
            timestamp: Number(s.timestamp) || Math.floor(Date.now() / 1000),
            recipientId: s.recipient_id,
            errors: s.errors || [],
          });
        }
      }
    }
    return statuses;
  }

  _cleanTo(to) {
    return String(to || '').replace(/@.*$/, '').replace(/[^\d]/g, '');
  }

  async _post(path, payload) {
    try {
      const res = await axios.post(`${this.graphBase}${path}`, payload, {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
      return res.data;
    } catch (err) {
      const metaError = err.response?.data?.error;
      const sanitizedErr = metaError
        ? {
            code: metaError.code,
            type: metaError.type,
            message: metaError.message,
            fbtrace_id: metaError.fbtrace_id,
          }
        : { message: err.message };

      console.error(`[CloudApiProvider] POST ${path} failed:`, sanitizedErr);
      const errorMsg = metaError
        ? `Meta API Error (${metaError.code || metaError.type}): ${metaError.message}`
        : err.message;
      const customError = new Error(errorMsg);
      customError.metaError = sanitizedErr;
      throw customError;
    }
  }

  async _get(path, params = {}) {
    try {
      const res = await axios.get(`${this.graphBase}${path}`, {
        headers: { Authorization: `Bearer ${this.apiToken}` },
        params,
        timeout: 30000,
      });
      return res.data;
    } catch (err) {
      const metaError = err.response?.data?.error;
      const sanitizedErr = metaError
        ? {
            code: metaError.code,
            type: metaError.type,
            message: metaError.message,
            fbtrace_id: metaError.fbtrace_id,
          }
        : { message: err.message };

      console.error(`[CloudApiProvider] GET ${path} failed:`, sanitizedErr);
      const errorMsg = metaError
        ? `Meta API Error (${metaError.code || metaError.type}): ${metaError.message}`
        : err.message;
      const customError = new Error(errorMsg);
      customError.metaError = sanitizedErr;
      throw customError;
    }
  }

  /**
   * Directly sends a full pre-constructed Meta messages API payload.
   *
   * @param {object} payload
   */
  async sendMessagePayload(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Payload must be an object');
    }
    return this._post(`/${this.phoneNumberId}/messages`, payload);
  }

  async sendText(to, body) {
    return this._post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this._cleanTo(to),
      type: 'text',
      text: { body, preview_url: false },
    });
  }

  async sendImage(to, urlOrId, caption) {
    const imagePayload = urlOrId.startsWith('http')
      ? { link: urlOrId, ...(caption ? { caption } : {}) }
      : { id: urlOrId, ...(caption ? { caption } : {}) };

    return this._post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this._cleanTo(to),
      type: 'image',
      image: imagePayload,
    });
  }

  async sendVideo(to, urlOrId, caption) {
    const videoPayload = urlOrId.startsWith('http')
      ? { link: urlOrId, ...(caption ? { caption } : {}) }
      : { id: urlOrId, ...(caption ? { caption } : {}) };

    return this._post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this._cleanTo(to),
      type: 'video',
      video: videoPayload,
    });
  }

  async sendDocument(to, urlOrId, filename, caption) {
    const docPayload = urlOrId.startsWith('http')
      ? { link: urlOrId, ...(filename ? { filename } : {}), ...(caption ? { caption } : {}) }
      : { id: urlOrId, ...(filename ? { filename } : {}), ...(caption ? { caption } : {}) };

    return this._post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this._cleanTo(to),
      type: 'document',
      document: docPayload,
    });
  }

  async sendMedia(to, mediaType, urlOrId, caption = null, filename = null) {
    const type = String(mediaType || 'image').toLowerCase();
    if (type === 'image') return this.sendImage(to, urlOrId, caption);
    if (type === 'video') return this.sendVideo(to, urlOrId, caption);
    if (type === 'document') return this.sendDocument(to, urlOrId, filename, caption);
    return this.sendImage(to, urlOrId, caption);
  }

  async sendTemplate(to, templateName, languageCode = 'en_US', componentsOrParameters = []) {
    let components = undefined;
    if (Array.isArray(componentsOrParameters) && componentsOrParameters.length > 0) {
      if (typeof componentsOrParameters[0] === 'object' && componentsOrParameters[0].type) {
        components = componentsOrParameters;
      } else {
        components = [
          {
            type: 'body',
            parameters: componentsOrParameters.map((text) => ({ type: 'text', text: String(text) })),
          },
        ];
      }
    }

    return this._post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this._cleanTo(to),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode || 'en_US' },
        ...(components ? { components } : {}),
      },
    });
  }

  /**
   * Send an interactive reply button message (1–3 buttons).
   */
  async sendInteractiveButton(to, body, buttons, header = null, footer = null) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this._cleanTo(to),
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: String(body).slice(0, 1024) },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: {
              id: String(b.id || '').slice(0, 256),
              title: String(b.title || '').slice(0, 20),
            },
          })),
        },
      },
    };
    if (header) payload.interactive.header = { type: 'text', text: String(header).slice(0, 60) };
    if (footer) payload.interactive.footer = { text: String(footer).slice(0, 60) };
    return this._post(`/${this.phoneNumberId}/messages`, payload);
  }

  /**
   * Send an interactive list message (sectioned menu, up to 10 rows).
   */
  async sendInteractiveList(to, body, buttonLabel, sections, header = null, footer = null) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this._cleanTo(to),
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: String(body).slice(0, 1024) },
        action: {
          button: String(buttonLabel || 'View Options').slice(0, 20),
          sections: (sections || []).slice(0, 10).map((sec) => ({
            title: String(sec.title || '').slice(0, 24),
            rows: (sec.rows || []).slice(0, 10).map((r) => ({
              id: String(r.id || '').slice(0, 200),
              title: String(r.title || '').slice(0, 24),
              ...(r.description ? { description: String(r.description).slice(0, 72) } : {}),
            })),
          })),
        },
      },
    };
    if (header) payload.interactive.header = { type: 'text', text: String(header).slice(0, 60) };
    if (footer) payload.interactive.footer = { text: String(footer).slice(0, 60) };
    return this._post(`/${this.phoneNumberId}/messages`, payload);
  }

  /**
   * Send an interactive CTA URL message.
   */
  async sendCTAUrl(to, body, buttonTitle, url, header = null, footer = null) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this._cleanTo(to),
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: String(body).slice(0, 1024) },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: String(buttonTitle || 'Visit Link').slice(0, 20),
            url: String(url),
          },
        },
      },
    };
    if (header) payload.interactive.header = { type: 'text', text: String(header).slice(0, 60) };
    if (footer) payload.interactive.footer = { text: String(footer).slice(0, 60) };
    return this._post(`/${this.phoneNumberId}/messages`, payload);
  }

  /**
   * Send a WhatsApp Flow interactive message.
   */
  async sendFlow(to, body, flowId, cta = 'Start', screen = null, data = null, flowToken = null, header = null, footer = null) {
    const token = flowToken || `flow_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const flowActionPayload = {
      ...(screen ? { screen } : {}),
      ...(data ? { data } : {}),
    };

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this._cleanTo(to),
      type: 'interactive',
      interactive: {
        type: 'flow',
        body: { text: String(body || 'Please complete the form.').slice(0, 1024) },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: token,
            flow_id: flowId,
            flow_cta: String(cta || 'Start').slice(0, 20),
            flow_action: 'navigate',
            ...(Object.keys(flowActionPayload).length > 0 ? { flow_action_payload: flowActionPayload } : {}),
          },
        },
      },
    };
    if (header) payload.interactive.header = { type: 'text', text: String(header).slice(0, 60) };
    if (footer) payload.interactive.footer = { text: String(footer).slice(0, 60) };
    return this._post(`/${this.phoneNumberId}/messages`, payload);
  }

  /**
   * Send a location message.
   */
  async sendLocation(to, latitude, longitude, name = null, address = null) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this._cleanTo(to),
      type: 'location',
      location: {
        latitude: Number(latitude),
        longitude: Number(longitude),
        ...(name ? { name: String(name).slice(0, 100) } : {}),
        ...(address ? { address: String(address).slice(0, 255) } : {}),
      },
    };
    return this._post(`/${this.phoneNumberId}/messages`, payload);
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
    return {
      buffer: Buffer.from(res.data),
      mime: mediaRef.mime || res.headers['content-type'] || 'application/octet-stream',
    };
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

  async getStatus() {
    try {
      const data = await this._get(`/${this.phoneNumberId}`);
      return {
        status: 'connected',
        phoneNumberId: this.phoneNumberId,
        displayPhoneNumber: data.display_phone_number,
        verifiedName: data.verified_name,
        qualityRating: data.quality_rating,
        codeVerificationStatus: data.code_verification_status,
      };
    } catch (err) {
      return {
        status: 'error',
        error: err.message,
      };
    }
  }
}

module.exports = { CloudApiProvider };
