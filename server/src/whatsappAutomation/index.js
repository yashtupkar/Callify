const routes = require('./routes');
const { WhatsAppAutomationInboundRouter } = require('./inboundRouter');
const { createWhatsAppAutomationProvider, initializeWhatsAppAutomationProviders } = require('./factory');
const { normalizeWhatsAppResponse, extractPlainText, isValidHttpUrl } = require('./responseNormalizer');
const { buildMetaPayload } = require('./metaPayloadBuilder');
const { sendWhatsAppResponse } = require('./responseDispatcher');

module.exports = {
  routes,
  WhatsAppAutomationInboundRouter,
  createWhatsAppAutomationProvider,
  initializeWhatsAppAutomationProviders,
  normalizeWhatsAppResponse,
  extractPlainText,
  isValidHttpUrl,
  buildMetaPayload,
  sendWhatsAppResponse,
};
