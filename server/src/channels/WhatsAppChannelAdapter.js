/**
 * WhatsAppChannelAdapter
 *
 * ChannelAdapter implementation for inbound/outbound WhatsApp messages.
 * Voice-style methods (sendAudio, clearAudio) are no-ops; text/image/document
 * methods hit the underlying WhatsAppProvider.
 *
 * Events emitted:
 *   - 'user_message'  (text):  { from, text, providerMessageId, timestamp }
 *   - 'user_media'    (media): { from, type, media, providerMessageId, timestamp, caption? }
 *   - 'disconnected'           (lifecycle: end of session)
 *   - 'error'                  (errors)
 */

const { ChannelAdapter } = require('./ChannelAdapter');

class WhatsAppChannelAdapter extends ChannelAdapter {
  /**
   * @param {object} opts
   * @param {import('../integrations/whatsapp/WhatsAppProvider')} opts.provider
   * @param {string} opts.contactWaId        Sender's WhatsApp id (no '+')
   * @param {string} opts.businessPhoneNumber  Our receiving number (E.164)
   * @param {string} opts.instanceId
   */
  constructor({ provider, contactWaId, contactJid, businessPhoneNumber, instanceId }) {
    super();
    this.provider = provider;
    this.contactWaId = contactWaId;
    this.contactJid = contactJid || contactWaId;
    this.businessPhoneNumber = businessPhoneNumber;
    this.instanceId = instanceId;
    this.contactProfileName = null;
    this.ended = false;
  }

  // ---- ChannelAdapter surface (voice methods: no-ops) --------------------

  sendAudio() {
    // No TTS audio on WhatsApp; replies are text.
  }

  clearAudio() {
    // No streaming audio buffer to clear.
  }

  sendControlMessage(msg) {
    // Used by ConversationManager to emit transcript/tool events to the
    // active live-chat socket (if any). The live socket wires itself to
    // a per-session listener set up by WhatsAppInboundRouter.
    if (typeof this._onControlMessage === 'function') {
      try { this._onControlMessage(msg); } catch (e) { /* ignore */ }
    }
  }

  endSession() {
    if (this.ended) return;
    this.ended = true;
    this.emit('disconnected');
  }

  getSessionMetadata() {
    const providerName = this.provider?.constructor?.name;
    const providerType = providerName === 'CloudApiProvider'
      ? 'cloud_api'
      : providerName === 'BaileysProvider'
        ? 'baileys'
        : 'whatsapp';
    return {
      provider: `whatsapp_${providerType}`,
      phoneNumber: this.businessPhoneNumber,
      contactWaId: this.contactWaId,
      instanceId: this.instanceId,
    };
  }

  // ---- Live-socket wiring ------------------------------------------------

  setControlMessageHandler(fn) {
    this._onControlMessage = fn;
  }

  // ---- Outbound methods (called by ConversationManager) ------------------

  async sendText(text, context = {}) {
    if (!text) return;
    try {
      const { sendWhatsAppResponse } = require('../whatsappAutomation/responseDispatcher');
      const result = await sendWhatsAppResponse({
        provider: this.provider,
        recipient: this.contactJid,
        response: text,
        context: {
          ...context,
          connectionId: this.instanceId,
          contactWaId: this.contactWaId,
          automationId: this.automationId,
          businessPhoneNumber: this.businessPhoneNumber,
          instanceId: this.instanceId,
        },
      });
      return result;
    } catch (err) {
      console.error('[WhatsAppChannelAdapter] sendText error:', err.message);
      this.emit('error', err);
    }
  }

  async sendResponse(response, context = {}) {
    if (!response) return;
    try {
      const { sendWhatsAppResponse } = require('../whatsappAutomation/responseDispatcher');
      return await sendWhatsAppResponse({
        provider: this.provider,
        recipient: this.contactJid,
        response,
        context: {
          ...context,
          connectionId: this.instanceId,
          contactWaId: this.contactWaId,
          automationId: this.automationId,
          businessPhoneNumber: this.businessPhoneNumber,
          instanceId: this.instanceId,
        },
      });
    } catch (err) {
      console.error('[WhatsAppChannelAdapter] sendResponse error:', err.message);
      this.emit('error', err);
    }
  }

  async sendImage(url, caption) {
    try {
      if (typeof this.provider.sendImage === 'function') {
        await this.provider.sendImage(this.contactJid, url, caption);
      }
    } catch (err) {
      console.error('[WhatsAppChannelAdapter] sendImage error:', err.message);
      this.emit('error', err);
    }
  }

  async sendDocument(url, filename) {
    try {
      if (typeof this.provider.sendDocument === 'function') {
        await this.provider.sendDocument(this.contactJid, url, filename);
      }
    } catch (err) {
      console.error('[WhatsAppChannelAdapter] sendDocument error:', err.message);
      this.emit('error', err);
    }
  }
}

module.exports = { WhatsAppChannelAdapter };
