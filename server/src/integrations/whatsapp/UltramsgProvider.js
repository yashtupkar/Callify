/**
 * UltramsgProvider
 *
 * Implements WhatsAppProvider against the Ultramsg HTTP API.
 * See https://docs.ultramsg.com/ for payload shapes.
 *
 * Config:
 *   instanceId   Ultramsg instance id (used as webhook instanceId discriminator)
 *   token        API token
 *   phoneNumber  E.164 number tied to this instance (informational)
 */

const axios = require('axios');
const { WhatsAppProvider } = require('./WhatsAppProvider');

class UltramsgProvider extends WhatsAppProvider {
  constructor(config) {
    super(config);
    this.instanceId = config.instanceId;
    this.token = config.token;
    this.phoneNumber = config.phoneNumber;
    if (!this.instanceId || !this.token) {
      throw new Error('UltramsgProvider requires instanceId and token');
    }
    this.baseUrl = `https://api.ultramsg.com/${this.instanceId}`;
  }

  verifyHandshake(req) {
    // Ultramsg may send a GET with hub.mode / hub.verify_token / hub.challenge
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode && token) {
      if (token === this.config.verifyToken) {
        return { ok: true, challenge: String(challenge || '') };
      }
      return { ok: false, error: 'verify_token mismatch' };
    }
    return { ok: true };
  }

  verifyInbound(req) {
    // Ultramsg doesn't sign webhooks. Discriminate by instanceId match.
    const body = req.body || {};
    const instanceId = body.instanceId;
    return !instanceId || instanceId === this.instanceId;
  }

  parseInbound(req) {
    const body = req.body || {};
    // Ultramsg shape: { event_type: 'webhook_received', instanceId, data: { id, from, body, type, media, timestamp } }
    if (body.event_type !== 'webhook_received' || !body.data) return [];
    const d = body.data;
    const type = (d.type || 'text').toLowerCase();

    const msg = {
      providerMessageId: d.id || `ultramsg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: d.from,
      timestamp: typeof d.timestamp === 'number' ? d.timestamp : Math.floor(Date.now() / 1000),
      type: 'unknown',
    };

    if (type === 'text' || type === 'chat') {
      msg.type = 'text';
      msg.text = d.body || '';
    } else if (type === 'image' || type === 'photo' || type === 'sticker') {
      msg.type = 'image';
      msg.media = {
        url: d.media?.url,
        mime: d.media?.mime || 'image/jpeg',
        caption: d.caption || d.body || '',
        providerMediaId: d.media?.id,
      };
    } else if (type === 'audio' || type === 'ptt' || type === 'voice') {
      msg.type = 'audio';
      msg.media = {
        url: d.media?.url,
        mime: d.media?.mime || 'audio/ogg',
        providerMediaId: d.media?.id,
      };
    } else if (type === 'document' || type === 'file') {
      msg.type = 'document';
      msg.media = {
        url: d.media?.url,
        mime: d.media?.mime || 'application/octet-stream',
        filename: d.name || d.filename,
        caption: d.body || '',
        providerMediaId: d.media?.id,
      };
    } else {
      // unsupported but log it
      msg.type = 'unknown';
      msg.text = d.body || '';
    }

    return [msg];
  }

  async _postForm(path, params) {
    const data = new URLSearchParams({ token: this.token, ...params });
    const res = await axios.post(`${this.baseUrl}${path}`, data.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
    });
    return res.data;
  }

  async sendText(to, body) {
    return this._postForm('/messages/chat', { to, body });
  }

  async sendImage(to, url, caption) {
    return this._postForm('/messages/image', { to, image: url, caption: caption || '' });
  }

  async sendDocument(to, url, filename) {
    return this._postForm('/messages/document', { to, document: url, filename: filename || '' });
  }

  async downloadMedia(mediaRef) {
    if (!mediaRef || !mediaRef.url) {
      throw new Error('UltramsgProvider.downloadMedia requires a url');
    }
    const res = await axios.get(mediaRef.url, { responseType: 'arraybuffer', timeout: 30000 });
    return { buffer: Buffer.from(res.data), mime: mediaRef.mime || res.headers['content-type'] || 'application/octet-stream' };
  }
}

module.exports = { UltramsgProvider };
