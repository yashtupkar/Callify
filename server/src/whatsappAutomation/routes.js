const express = require('express');
const { dbService } = require('../services/DatabaseService');
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const { createWhatsAppAutomationProvider } = require('./factory');
const { store } = require('./sessionStore');

const router = express.Router();
router.use(authMiddleware);

async function resolveWorkspaceId(req) {
  if (req.user.workspaceId) return req.user.workspaceId;
  const workspace = await dbService.prisma.workspace.findFirst({
    where: { name: 'Default Workspace' },
    select: { id: true },
  }) || await dbService.prisma.workspace.findFirst({ select: { id: true } });
  return workspace?.id || null;
}

router.get('/', async (req, res) => {
  try {
    const workspaceId = await resolveWorkspaceId(req);
    const where = req.user.role === 'admin' ? {} : { workspaceId };
    const automations = await dbService.prisma.whatsAppAutomation.findMany({ where, include: { connections: true, tools: true } });
    res.json({ automations: automations.map(automation => ({ ...automation, connections: automation.connections.map(scrub) })) });
  } catch (error) {
    console.error('[WhatsAppAutomation] list error:', error);
    res.status(500).json({ error: 'Failed to load WhatsApp automations' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, description, language, supportedLanguages, systemPrompt, initialMessage, businessName, timezone, status, promptConfig } = req.body || {};
    if (!name || !systemPrompt) return res.status(400).json({ error: 'name and systemPrompt are required' });
    const workspaceId = await resolveWorkspaceId(req);
    if (!workspaceId) return res.status(500).json({ error: 'No workspace is configured for this account' });
    const automation = await dbService.prisma.whatsAppAutomation.create({
      data: {
        workspaceId,
        name,
        description: description || null,
        language: language || 'en-US',
        supportedLanguages: Array.isArray(supportedLanguages) ? supportedLanguages : [language || 'en-US'],
        systemPrompt,
        initialMessage: initialMessage || null,
        businessName: businessName || null,
        timezone: timezone || 'Asia/Kolkata',
        status: status || 'active',
        promptConfig: promptConfig || null,
      },
    });
    res.status(201).json({ automation });
  } catch (error) {
    console.error('[WhatsAppAutomation] create error:', error);
    res.status(500).json({ error: error.message || 'Failed to create WhatsApp automation' });
  }
});

router.get('/sessions', requireAdmin, (req, res) => {
  res.json({ sessions: store.list().map(({ conversationManager, ...session }) => ({ ...session, messageCount: conversationManager?.transcript?.length || 0 })) });
});

router.get('/:automationId', async (req, res) => {
  try {
    const automation = await dbService.prisma.whatsAppAutomation.findFirst({
      where: {
        id: req.params.automationId,
        ...(req.user.role === 'admin' ? {} : { workspaceId: req.user.workspaceId }),
      },
      include: { connections: true, tools: true },
    });
    if (!automation) return res.status(404).json({ error: 'Automation not found' });
    res.json({ automation: { ...automation, connections: automation.connections.map(scrub) } });
  } catch (error) {
    console.error('[WhatsAppAutomation] get error:', error);
    res.status(500).json({ error: 'Failed to load WhatsApp automation' });
  }
});

router.put('/:automationId', requireAdmin, async (req, res) => {
  try {
    const { name, description, language, supportedLanguages, systemPrompt, initialMessage, businessName, timezone, status, promptConfig } = req.body || {};
    if (!name || !systemPrompt) return res.status(400).json({ error: 'name and systemPrompt are required' });
    const workspaceId = await resolveWorkspaceId(req);
    const automation = await dbService.prisma.whatsAppAutomation.updateMany({
      where: { id: req.params.automationId, workspaceId },
      data: { name, description, language, supportedLanguages, systemPrompt, initialMessage, businessName, timezone, status, promptConfig },
    });
    if (!automation.count) return res.status(404).json({ error: 'Automation not found' });
    store.clearAutomation(req.params.automationId);
    res.json({ ok: true });
  } catch (error) {
    console.error('[WhatsAppAutomation] update error:', error);
    res.status(500).json({ error: error.message || 'Failed to update WhatsApp automation' });
  }
});

router.delete('/:automationId', requireAdmin, async (req, res) => {
  const result = await dbService.prisma.whatsAppAutomation.deleteMany({ where: { id: req.params.automationId, workspaceId: req.user.workspaceId } });
  if (!result.count) return res.status(404).json({ error: 'Automation not found' });
  res.status(204).send();
});

router.post('/:automationId/connections', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const phoneNumber = String(body.phoneNumber || '').trim();
    if (!body.provider || !phoneNumber) return res.status(400).json({ error: 'provider and phoneNumber are required' });
    if (!['baileys', 'cloud_api', 'meta_cloud', 'meta'].includes(body.provider)) return res.status(400).json({ error: 'Unsupported provider' });
    const workspaceId = await resolveWorkspaceId(req);
    const automation = await dbService.prisma.whatsAppAutomation.findFirst({ where: { id: req.params.automationId, workspaceId } });
    if (!automation) return res.status(404).json({ error: 'Automation not found' });

    const existing = await dbService.prisma.whatsAppConnection.findUnique({
      where: { automationId_phoneNumber: { automationId: automation.id, phoneNumber } },
    });
    if (existing) {
      return res.status(409).json({
        error: 'This phone number is already connected to this automation.',
        connection: scrub(existing),
      });
    }

    const connection = await dbService.prisma.whatsAppConnection.create({
      data: {
        provider: body.provider,
        phoneNumber,
        phoneNumberId: body.phoneNumberId || null,
        businessId: body.businessId || null,
        instanceId: body.instanceId || null,
        apiToken: body.apiToken || null,
        verifyToken: body.verifyToken || null,
        appSecret: body.appSecret || null,
        credentials: body.credentials || null,
        automationId: automation.id,
      },
    });
    try {
      createWhatsAppAutomationProvider(connection);
    } catch (error) {
      await dbService.prisma.whatsAppConnection.delete({ where: { id: connection.id } });
      return res.status(400).json({ error: error.message });
    }
    res.status(201).json({ connection: scrub(connection) });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'This phone number is already connected to this automation.' });
    }
    console.error('[WhatsAppAutomation] connection create error:', error);
    res.status(500).json({ error: error.message || 'Failed to create WhatsApp connection' });
  }
});

router.put('/:automationId/connections/:connectionId', requireAdmin, async (req, res) => {
  const connection = await dbService.prisma.whatsAppConnection.updateMany({
    where: { id: req.params.connectionId, automationId: req.params.automationId, automation: { workspaceId: req.user.workspaceId } },
    data: req.body || {},
  });
  if (!connection.count) return res.status(404).json({ error: 'Connection not found' });
  res.json({ ok: true });
});

router.delete('/:automationId/connections/:connectionId', requireAdmin, async (req, res) => {
  const result = await dbService.prisma.whatsAppConnection.deleteMany({
    where: { id: req.params.connectionId, automationId: req.params.automationId, automation: { workspaceId: req.user.workspaceId } },
  });

  if (!result.count) return res.status(404).json({ error: 'Connection not found' });
  res.status(204).send();
});

router.get('/:automationId/connections/:connectionId/status', requireAdmin, async (req, res) => {
  const connection = await dbService.prisma.whatsAppConnection.findFirst({
    where: { id: req.params.connectionId, automationId: req.params.automationId, automation: { workspaceId: req.user.workspaceId } },
  });
  if (!connection) return res.status(404).json({ error: 'Connection not found' });
  try {
    const provider = createWhatsAppAutomationProvider(connection);
    res.json({ status: typeof provider.getStatus === 'function' ? provider.getStatus() : { status: 'configured' } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:automationId/sessions', requireAdmin, (req, res) => {
  res.json({ sessions: store.list().filter(session => session.automationId === req.params.automationId).map(({ conversationManager, ...session }) => ({ ...session, messageCount: conversationManager?.transcript?.length || 0 })) });
});

function scrub(connection) {
  const { apiToken, appSecret, ...safe } = connection;
  return { ...safe, apiToken: apiToken ? '***' : null, appSecret: appSecret ? '***' : null };
}

module.exports = router;
