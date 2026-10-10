const { CloudApiProvider } = require('../integrations/whatsapp/CloudApiProvider');
const { BaileysProvider } = require('../integrations/whatsapp/baileysProvider');
const { dbService } = require('../services/DatabaseService');
const { handleMessages } = require('./runtime');
const { baileysInstanceManager } = require('../services/BaileysInstanceManager');

const activeBaileys = new Map();

function createWhatsAppAutomationProvider(connection) {
  const provider = String(connection.provider || '').toLowerCase();
  if (provider === 'cloud_api' || provider === 'meta_cloud' || provider === 'meta') {
    return new CloudApiProvider({
      phoneNumberId: connection.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID,
      businessId: connection.businessId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
      apiToken: connection.apiToken || process.env.WHATSAPP_ACCESS_TOKEN,
      verifyToken: connection.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN,
      appSecret: connection.appSecret || process.env.WHATSAPP_APP_SECRET,
      apiVersion: connection.credentials?.apiVersion || process.env.WHATSAPP_API_VERSION || 'v20.0',
    });
  }
  if (provider === 'baileys') {
    if (activeBaileys.has(connection.id)) return activeBaileys.get(connection.id);
    const existing = connection.instanceId && baileysInstanceManager.getInstance(connection.instanceId);
    if (existing) {
      const instanceId = connection.instanceId;
      const handler = async (message) => {
        const current = await dbService.prisma.whatsAppConnection.findUnique({
          where: { id: connection.id },
          include: { automation: { include: { tools: true } } },
        });
        if (current?.enabled && current.automation?.status !== 'paused') {
          await handleMessages({
            automation: current.automation,
            connection: current,
            provider: existing,
            messages: [message],
          });
        } else {
          console.warn(`[WhatsAppAutomation] Ignoring message for paused or disabled connection ${connection.id}`);
        }
      };
      baileysInstanceManager.registerStandaloneInstance(instanceId, handler);
      activeBaileys.set(connection.id, existing);
      return existing;
    }
    const instance = new BaileysProvider({
      instanceId: connection.instanceId || connection.id,
      authPath: process.env.BAILEYS_AUTH_FOLDER || './baileys_auth',
      onMessage: async (message) => {
        const current = await dbService.prisma.whatsAppConnection.findUnique({
          where: { id: connection.id },
          include: { automation: { include: { tools: true } } },
        });
        if (current?.enabled && current.automation?.status !== 'paused') {
          await handleMessages({
            automation: current.automation,
            connection: current,
            provider: instance,
            messages: [message],
          });
        } else {
          console.warn(`[WhatsAppAutomation] Ignoring message for paused or disabled connection ${connection.id}`);
        }
      },
    });
    activeBaileys.set(connection.id, instance);
    return instance;
  }
  throw new Error(`Unsupported standalone WhatsApp provider: ${connection.provider}`);
}

module.exports = { createWhatsAppAutomationProvider, CloudApiProvider, BaileysProvider };

async function initializeWhatsAppAutomationProviders() {
  try {
    const connections = await dbService.prisma.whatsAppConnection.findMany({
      where: { enabled: true },
      include: { automation: { include: { tools: true } } },
    });
    for (const connection of connections) {
      try {
        createWhatsAppAutomationProvider(connection);
        console.log(`[WhatsAppAutomation] Initialized ${connection.provider} connection ${connection.id}`);
      } catch (error) {
        console.error(`[WhatsAppAutomation] Failed to initialize connection ${connection.id}:`, error.message);
      }
    }
  } catch (err) {
    console.error('[WhatsAppAutomation] Failed to load connections for initialization:', err.message);
  }
}

module.exports.initializeWhatsAppAutomationProviders = initializeWhatsAppAutomationProviders;
