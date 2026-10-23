const { CloudApiProvider } = require('../integrations/whatsapp/CloudApiProvider');
const { dbService } = require('../services/DatabaseService');
const { handleMessages } = require('./runtime');
const { decryptConnectionSecrets } = require('./secretBox');
const inbox = require('./inbox');

function createWhatsAppAutomationProvider(storedConnection) {
  // Secrets are encrypted at rest; decrypt only in memory for provider construction
  const connection = decryptConnectionSecrets(storedConnection);
  const provider = String(connection.provider || '').toLowerCase();
  if (provider === 'cloud_api' || provider === 'meta_cloud' || provider === 'meta' || !provider) {
    return new CloudApiProvider({
      phoneNumberId: connection.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID,
      businessId: connection.businessId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
      apiToken: connection.apiToken || process.env.WHATSAPP_ACCESS_TOKEN,
      verifyToken: connection.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN,
      appSecret: connection.appSecret || process.env.WHATSAPP_APP_SECRET,
      apiVersion: connection.credentials?.apiVersion || process.env.WHATSAPP_API_VERSION || 'v20.0',
    });
  }
  throw new Error(`Unsupported WhatsApp provider "${connection.provider}". Only Meta Cloud API is supported.`);
}

module.exports = { createWhatsAppAutomationProvider, CloudApiProvider };

async function initializeWhatsAppAutomationProviders() {
  try {
    const connections = await dbService.prisma.whatsAppConnection.findMany({
      where: { enabled: true },
      include: { automation: { include: { tools: true } } },
    });
    startInboxRecovery();
    for (const connection of connections) {
      try {
        createWhatsAppAutomationProvider(connection);
      } catch (error) {
        console.error(`[WhatsAppAutomation] Failed to initialize connection ${connection.id}:`, error.message);
      }
    }
  } catch (err) {
    console.error('[WhatsAppAutomation] Failed to load connections for initialization:', err.message);
  }
}

module.exports.initializeWhatsAppAutomationProviders = initializeWhatsAppAutomationProviders;

async function replayInboxMessages({ connectionId, messages }) {
  const connection = await dbService.prisma.whatsAppConnection.findUnique({
    where: { id: connectionId },
    include: { automation: { include: { tools: true } } },
  });
  if (!connection?.enabled || connection.automation?.status === 'paused') return;
  const provider = createWhatsAppAutomationProvider(connection);
  await handleMessages({ automation: connection.automation, connection, provider, messages, replay: true });
}

/** Cleans stale pending messages and trims old inbox rows without replaying duplicate replies. */
function startInboxRecovery({ intervalMs = 60000 } = {}) {
  const tick = async () => {
    try {
      await inbox.dropStalePending(10000);
      await inbox.purge();
    } catch (err) {
      if (err.code !== 'P2021') console.error('[WhatsAppAutomation] Inbox recovery failed:', err.message);
    }
  };
  setTimeout(tick, 5000).unref();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return timer;
}

module.exports.startInboxRecovery = startInboxRecovery;
module.exports.replayInboxMessages = replayInboxMessages;
