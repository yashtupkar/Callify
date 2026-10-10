const { dbService } = require('../services/DatabaseService');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { createWhatsAppAutomationProvider } = require('../whatsappAutomation/factory');
const { repo } = require('./repo');
const { createService } = require('./service');
const { createWorker } = require('./worker');
const { createCampaignsRouter, createWorkspaceResolver } = require('./routes');
const { handleInboundOptOut, applyStatusUpdates } = require('./hooks');

const service = createService({ repo, createProvider: createWhatsAppAutomationProvider });

function buildRouter() {
  return createCampaignsRouter({
    service,
    authenticate,
    authorize: requireAdmin,
    resolveWorkspaceId: createWorkspaceResolver(dbService.prisma),
  });
}

let worker = null;
function startWorker() {
  if (String(process.env.CAMPAIGN_WORKER_ENABLED || 'true').toLowerCase() === 'false') {
    console.log('[Campaigns] Worker disabled by CAMPAIGN_WORKER_ENABLED=false');
    return null;
  }
  if (!worker) {
    worker = createWorker({ repo, createProvider: createWhatsAppAutomationProvider });
    worker.start();
  }
  return worker;
}
async function stopWorker() {
  if (worker) await worker.stop();
  worker = null;
}

module.exports = {
  buildRouter,
  startWorker,
  stopWorker,
  onInboundMessages: ({ automation, messages }) =>
    Promise.all((messages || []).map((m) => handleInboundOptOut({ repo, workspaceId: automation?.workspaceId, from: m.from, text: m.text }))),
  onStatusUpdates: (connection, updates) => applyStatusUpdates({ repo, connection, updates }),
};
