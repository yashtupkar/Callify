/**
 * /api/whatsapp
 *
 * - CRUD on WhatsAppInstance (one row per business phone number)
 * - PhoneNumber binding (channel=whatsapp)
 * - Test send (admin only)
 *
 * The webhook itself is mounted directly in server.js because we need
 * raw-body parsing for Meta's signature verification.
 */

const express = require('express');
const { dbService } = require('../services/DatabaseService');
const { createWhatsApp } = require('../integrations/ProviderFactory');
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const { PRESETS, listPresets, getPreset, fillTemplate } = require('../modules/whatsapp/automationPresets');

const router = express.Router();
router.use(authMiddleware);

// List instances for the caller's workspace (admin sees all)
router.get('/instances', async (req, res) => {
  try {
    const where = req.user.role === 'admin' ? {} : { workspaceId: req.user.workspaceId };
    const instances = await dbService.prisma.whatsAppInstance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ instances: instances.map(_scrub) });
  } catch (err) {
    console.error('[whatsapp] list instances error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create a new instance
router.post('/instances', requireAdmin, async (req, res) => {
  try {
    const { provider, phoneNumber, instanceId, apiToken, verifyToken, phoneNumberId, businessId, appSecret, workspaceId } = req.body || {};
    if (!provider || !phoneNumber || !apiToken || !verifyToken) {
      return res.status(400).json({ error: 'provider, phoneNumber, apiToken and verifyToken are required' });
    }
    if (!['ultramsg', 'cloud_api'].includes(provider)) {
      return res.status(400).json({ error: 'provider must be ultramsg or cloud_api' });
    }

    // Validate by trying to build the provider
    try {
      createWhatsApp({
        provider, instanceId, apiToken, phoneNumber, phoneNumberId, businessId, verifyToken, appSecret,
      });
    } catch (e) {
      return res.status(400).json({ error: `Invalid provider config: ${e.message}` });
    }

    const wsId = req.user.role === 'admin' ? (workspaceId || req.user.workspaceId) : req.user.workspaceId;
    const inst = await dbService.prisma.whatsAppInstance.create({
      data: {
        workspaceId: wsId,
        provider,
        phoneNumber,
        instanceId: instanceId || null,
        apiToken,
        verifyToken,
        phoneNumberId: phoneNumberId || null,
        businessId: businessId || null,
        appSecret: appSecret || null,
        enabled: true,
      },
    });

    // Make sure there's a PhoneNumber row for this number bound to the same workspace
    await dbService.prisma.phoneNumber.upsert({
      where: { phoneNumber },
      create: {
        phoneNumber,
        workspaceId: wsId,
        channel: 'whatsapp',
        whatsAppInstanceId: inst.id,
      },
      update: {
        channel: 'whatsapp',
        whatsAppInstanceId: inst.id,
        workspaceId: wsId,
      },
    });

    res.status(201).json({ instance: _scrub(inst) });
  } catch (err) {
    console.error('[whatsapp] create instance error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update an instance (rotate token, toggle enabled, change agent binding)
router.put('/instances/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { apiToken, verifyToken, enabled, appSecret, agentId, phoneNumberId, businessId, instanceId } = req.body || {};
    const data = {};
    if (apiToken !== undefined) data.apiToken = apiToken;
    if (verifyToken !== undefined) data.verifyToken = verifyToken;
    if (appSecret !== undefined) data.appSecret = appSecret;
    if (enabled !== undefined) data.enabled = !!enabled;
    if (phoneNumberId !== undefined) data.phoneNumberId = phoneNumberId;
    if (businessId !== undefined) data.businessId = businessId;
    if (instanceId !== undefined) data.instanceId = instanceId;
    const inst = await dbService.prisma.whatsAppInstance.update({ where: { id }, data });

    if (agentId !== undefined) {
      await dbService.prisma.phoneNumber.updateMany({
        where: { whatsAppInstanceId: id },
        data: { agentId: agentId || null },
      });
    }

    res.json({ instance: _scrub(inst) });
  } catch (err) {
    console.error('[whatsapp] update instance error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete an instance
router.delete('/instances/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await dbService.prisma.phoneNumber.updateMany({ where: { whatsAppInstanceId: id }, data: { whatsAppInstanceId: null, channel: 'voice' } });
    await dbService.prisma.whatsAppInstance.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[whatsapp] delete instance error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Send a test message from a specific instance
router.post('/instances/:id/test-send', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { to, body, imageUrl, documentUrl, filename, template, language, parameters } = req.body || {};
    if (!to) return res.status(400).json({ error: 'to is required' });

    const inst = await dbService.prisma.whatsAppInstance.findUnique({ where: { id } });
    if (!inst) return res.status(404).json({ error: 'Instance not found' });
    if (!inst.enabled) return res.status(400).json({ error: 'Instance is disabled' });

    const provider = createWhatsApp({
      provider: inst.provider,
      instanceId: inst.instanceId || undefined,
      apiToken: inst.apiToken,
      phoneNumber: inst.phoneNumber,
      phoneNumberId: inst.phoneNumberId || undefined,
      businessId: inst.businessId || undefined,
      verifyToken: inst.verifyToken,
      appSecret: inst.appSecret || undefined,
    });

    const toDigits = String(to).replace(/[^\d]/g, '');
    let result;
    if (template) {
      result = await provider.sendTemplate(toDigits, template, language || 'en', parameters || []);
    } else if (imageUrl) {
      result = await provider.sendImage(toDigits, imageUrl, body);
    } else if (documentUrl) {
      result = await provider.sendDocument(toDigits, documentUrl, filename);
    } else {
      result = await provider.sendText(toDigits, body || 'Hello from Callify (test message).');
    }

    res.json({ ok: true, result });
  } catch (err) {
    console.error('[whatsapp] test-send error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Live session list (admin) — mirrors the in-process store
router.get('/sessions', requireAdmin, (req, res) => {
  const { store } = require('../services/WhatsAppSessionStore');
  const sessions = store.list().map(s => ({
    key: s.key,
    agentId: s.agentId,
    contactWaId: s.contactWaId,
    createdAt: s.createdAt,
    lastActivityAt: s.lastActivityAt,
    messageCount: s.conversationManager?.transcript?.length || 0,
  }));
  res.json({ sessions });
});

// Fetch full transcript for a single live session
router.get('/sessions/:key/messages', requireAdmin, (req, res) => {
  const { store } = require('../services/WhatsAppSessionStore');
  const entry = store.sessions.get(req.params.key);
  if (!entry) return res.status(404).json({ error: 'Session not found' });
  res.json({
    key: req.params.key,
    agentId: entry.agentId,
    contactWaId: entry.contactWaId,
    transcript: entry.conversationManager?.transcript || [],
  });
});

// ------------------------------------------------------------------
// Automation Presets + Agent provisioning for selling agents to clients
// ------------------------------------------------------------------

function _scrub(inst) {
  if (!inst) return inst;
  const { apiToken, appSecret, ...rest } = inst;
  return { ...rest, apiToken: apiToken ? '***' : null, appSecret: appSecret ? '***' : null };
}

// GET /api/whatsapp/presets - list all automation purposes
router.get('/presets', (req, res) => {
  res.json({ presets: listPresets() });
});

// POST /api/whatsapp/automations
// Body: { presetId, name, businessName, timezone, language, agentId?, phoneInstanceId? }
// Creates (or updates) an Agent with the preset's prompt/data/guidelines.
router.post('/automations', requireAdmin, async (req, res) => {
  try {
    const { presetId, name, businessName, timezone, language, agentId, phoneInstanceId } = req.body || {};
    const preset = getPreset(presetId || 'custom');
    if (!preset) return res.status(400).json({ error: 'Unknown preset' });

    const agentName = name || preset.name;
    const vars = { agentName, businessName: businessName || 'our business', timezone: timezone || 'Asia/Kolkata' };
    const systemPrompt = fillTemplate(preset.systemPrompt, vars);
    const initialMessage = fillTemplate(preset.initialMessage, vars);

    const conversationGuidelines = [
      `Goal: ${preset.description}`,
      `Tone: ${preset.tone || 'Friendly and concise.'}`,
      `Data to collect before any action: ${preset.defaultDataFields.join(', ')}.`,
      `Recommended tools: ${preset.recommendedTools.join(', ') || '(none)'}.`,
      `Rules: Keep replies under 3 short sentences. Confirm every action with the customer. If unsure, ask or transfer to a human.`,
    ].join('\n\n');

    const tools = {
      dataToCollect: preset.defaultDataFields,
      customTools: [],
    };

    let agent;
    if (agentId) {
      agent = await dbService.prisma.agent.update({
        where: { id: agentId },
        data: {
          name: agentName,
          systemPrompt,
          initialMessage,
          conversationGuidelines,
          tools,
          timezone: vars.timezone,
          language: language || 'en-US',
          whatsappEnabled: true,
          automationPurpose: preset.id,
          automationStatus: 'draft',
        },
      });
    } else {
      const ws = await dbService.prisma.workspace.findFirst({ where: { name: 'Default Workspace' } });
      if (!ws) return res.status(500).json({ error: 'No workspace' });
      agent = await dbService.prisma.agent.create({
        data: {
          workspaceId: ws.id,
          name: agentName,
          systemPrompt,
          initialMessage,
          conversationGuidelines,
          tools,
          timezone: vars.timezone,
          language: language || 'en-US',
          whatsappEnabled: true,
          automationPurpose: preset.id,
          automationStatus: 'draft',
        },
      });
    }

    // Optionally bind the configured WhatsApp phone number to this agent
    if (phoneInstanceId) {
      await dbService.prisma.phoneNumber.updateMany({
        where: { whatsAppInstanceId: phoneInstanceId },
        data: { agentId: agent.id },
      });
    }

    res.status(201).json({ agent, preset: { id: preset.id, name: preset.name } });
  } catch (err) {
    console.error('[whatsapp] create automation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/whatsapp/automations/:agentId/status
// Body: { status: 'active' | 'paused' | 'draft' }
router.put('/automations/:agentId/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['active', 'paused', 'draft'].includes(status)) {
      return res.status(400).json({ error: 'status must be active|paused|draft' });
    }
    const agent = await dbService.prisma.agent.update({
      where: { id: req.params.agentId },
      data: { automationStatus: status, whatsappEnabled: status === 'active' },
    });
    res.json({ agent });
  } catch (err) {
    console.error('[whatsapp] update automation status:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
