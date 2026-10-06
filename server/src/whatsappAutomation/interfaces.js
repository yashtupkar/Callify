/**
 * Provider-neutral contracts used by standalone WhatsApp automation.
 * Providers normalize inbound events and expose only transport primitives.
 */
class WhatsAppAutomationProvider {
  verifyHandshake() { return { ok: true }; }
  verifyInbound() { return true; }
  parseInbound() { throw new Error('parseInbound() must be implemented'); }
  async sendText() { throw new Error('sendText() must be implemented'); }
  async sendImage() { throw new Error('sendImage() must be implemented'); }
  async sendDocument() { throw new Error('sendDocument() must be implemented'); }
  async downloadMedia() { throw new Error('downloadMedia() must be implemented'); }
}

module.exports = { WhatsAppAutomationProvider };
