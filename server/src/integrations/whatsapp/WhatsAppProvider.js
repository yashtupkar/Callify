/**
 * WhatsAppProvider
 *
 * Abstract base for WhatsApp transport implementations (Ultramsg, Meta Cloud API).
 * Each provider converts the provider's webhook payload into a normalized
 * NormalizedMessage[] structure and exposes send/download primitives.
 *
 * A "provider" here is the transport layer (HTTP) only. Session lifecycle,
 * ConversationManager wiring and channel abstraction live elsewhere.
 */

class WhatsAppProvider {
  constructor(config) {
    if (this.constructor === WhatsAppProvider) {
      throw new Error('Cannot instantiate abstract WhatsAppProvider');
    }
    this.config = config;
  }

  /**
   * Verify a webhook challenge/handshake request (GET from provider).
   * @returns {{ ok: boolean, challenge?: string, error?: string }}
   */
  verifyHandshake(req) {
    return { ok: true };
  }

  /**
   * Verify an inbound POST webhook signature/credentials.
   * @returns {boolean}
   */
  verifyInbound(req) {
    return true;
  }

  /**
   * Parse a provider's inbound webhook body into a normalized structure.
   * @param {object} req  Express req (body already parsed as JSON)
   * @returns {NormalizedMessage[]}  Empty array if no actionable messages.
   *
   * NormalizedMessage = {
   *   providerMessageId: string,
   *   from: string,           // sender's WhatsApp id (e.g. "9199xxxxxxx")
   *   timestamp: number,      // unix seconds
   *   type: 'text' | 'image' | 'audio' | 'document' | 'button' | 'list' | 'unknown',
   *   text?: string,
   *   media?: { url?: string, mime?: string, providerMediaId?: string, caption?: string, filename?: string }
   * }
   */
  parseInbound(req) {
    throw new Error('parseInbound() must be implemented by subclass');
  }

  /**
   * Send a text message to a contact.
   * @param {string} to  Contact's WhatsApp id (no '+')
   * @param {string} body
   */
  async sendText(to, body) {
    throw new Error('sendText() must be implemented by subclass');
  }

  /**
   * Send an image (by URL) with optional caption.
   */
  async sendImage(to, url, caption) {
    throw new Error('sendImage() must be implemented by subclass');
  }

  /**
   * Send a document (by URL) with optional filename.
   */
  async sendDocument(to, url, filename) {
    throw new Error('sendDocument() must be implemented by subclass');
  }

  /**
   * Send an approved template message (Meta Cloud API only).
   * Ultramsg subclass may throw or fall back to sendText.
   */
  async sendTemplate(to, templateName, languageCode, parameters = []) {
    throw new Error('sendTemplate() not supported by this provider');
  }

  /**
   * Download media bytes for transcription/inspection.
   * Returns { buffer: Buffer, mime: string }.
   */
  async downloadMedia(mediaRef) {
    throw new Error('downloadMedia() must be implemented by subclass');
  }
}

module.exports = { WhatsAppProvider };
