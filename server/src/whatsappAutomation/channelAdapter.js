const { WhatsAppChannelAdapter } = require('../channels/WhatsAppChannelAdapter');

class WhatsAppAutomationChannelAdapter extends WhatsAppChannelAdapter {
  constructor({ automationId, ...opts }) {
    super(opts);
    this.automationId = automationId;
  }

  getSessionMetadata() {
    return {
      ...super.getSessionMetadata(),
      provider: `whatsapp_automation_${this.provider.constructor.name}`,
      automationId: this.automationId,
    };
  }
}

module.exports = { WhatsAppAutomationChannelAdapter };
