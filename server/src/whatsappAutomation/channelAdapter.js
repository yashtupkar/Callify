const { WhatsAppChannelAdapter } = require('../channels/WhatsAppChannelAdapter');

class WhatsAppAutomationChannelAdapter extends WhatsAppChannelAdapter {
  getSessionMetadata() {
    return {
      ...super.getSessionMetadata(),
      provider: `whatsapp_automation_${this.provider.constructor.name}`,
    };
  }
}

module.exports = { WhatsAppAutomationChannelAdapter };
