const routes = require('./routes');
const { WhatsAppAutomationInboundRouter } = require('./inboundRouter');
const { createWhatsAppAutomationProvider, initializeWhatsAppAutomationProviders } = require('./factory');
module.exports = { routes, WhatsAppAutomationInboundRouter, createWhatsAppAutomationProvider, initializeWhatsAppAutomationProviders };
