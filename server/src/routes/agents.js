const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { dbService } = require('../services/DatabaseService');
const { generateConversationGuidelines } = require('../modules/prompt/conversationGuidelineGenerator');
const { authenticate, requireRole } = require('../middleware/auth');

function generateTempPassword() {
  // 12 chars, easy to read
  return crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
}

async function ensureAgentAccess(req, res) {
  const { id } = req.params;
  if (req.user.role === 'admin') return true;
  const agent = await dbService.prisma.agent.findUnique({
    where: { id },
    select: { allowedEmails: true },
  });
  if (!agent) {
    res.status(404).json({ error: 'Agent not found' });
    return false;
  }
  if (!(agent.allowedEmails || []).includes(req.user.email)) {
    res.status(403).json({ error: 'Forbidden: no access to this agent' });
    return false;
  }
  return true;
}

// GET /api/agents/:id - Get a single agent (admin always, or user if invited)
router.get('/:id', authenticate, async (req, res) => {
  try {
    const agent = await dbService.prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (req.user.role !== 'admin' && !(agent.allowedEmails || []).includes(req.user.email)) {
      return res.status(403).json({ error: 'Forbidden: no access to this agent' });
    }
    res.json(agent);
  } catch (err) {
    console.error('[Agents API] Error fetching agent:', err);
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
});

// GET /api/agents - List all agents (admin sees all; user sees only their assigned)
router.get('/', authenticate, async (req, res) => {
  try {
    const where = req.user.role === 'admin'
      ? {}
      : { allowedEmails: { has: req.user.email } };
    const agents = await dbService.prisma.agent.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    res.json(agents);
  } catch (err) {
    console.error('[Agents API] Error fetching agents:', err);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// POST /api/agents - Create a new agent (admin only)
router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { name, systemPrompt, conversationGuidelines, initialMessage, voiceId, language, timezone, enableWhatsAppConfirmation, enableEmailConfirmation, tools, providers, whatsappEnabled, automationPurpose, automationStatus } = req.body;

    // Quick patch: Find default workspace to prevent crashing since workspaceId is required
    const defaultWorkspace = await dbService.prisma.workspace.findFirst({
      where: { name: 'Default Workspace' }
    });

    if (!defaultWorkspace) {
      return res.status(500).json({ error: 'No default workspace found. Run seed script.' });
    }

    // Fallback if tools is string, try parsing or default to empty
    let parsedTools = null;
    if (typeof tools === 'string') {
      try { parsedTools = JSON.parse(tools); } catch(e) {}
    } else {
      parsedTools = tools;
    }

    const newAgent = await dbService.prisma.agent.create({
      data: {
        workspaceId: defaultWorkspace.id,
        name: name || 'Custom Agent',
        systemPrompt: systemPrompt || '',
        conversationGuidelines: conversationGuidelines || null,
        initialMessage: initialMessage || 'Hello!',
        voiceId: voiceId || null,
        language: language || 'en-US',
        timezone: timezone || 'Asia/Kolkata',
        enableWhatsAppConfirmation: enableWhatsAppConfirmation || false,
        enableEmailConfirmation: enableEmailConfirmation || false,
        tools: parsedTools,
        providers: providers || null,
        whatsappEnabled: !!whatsappEnabled,
        automationPurpose: automationPurpose || null,
        automationStatus: automationStatus || 'draft',
      }
    });
    res.status(201).json(newAgent);
  } catch (err) {
    console.error('[Agents API] Error creating agent:', err);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// PUT /api/agents/:id - Update an agent
router.put('/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, systemPrompt, conversationGuidelines, initialMessage, voiceId, language, timezone, enableWhatsAppConfirmation, enableEmailConfirmation, tools, providers, whatsappEnabled, automationPurpose, automationStatus } = req.body;

    let parsedTools = null;
    if (typeof tools === 'string') {
      try { parsedTools = JSON.parse(tools); } catch(e) {}
    } else if (tools) {
      parsedTools = tools;
    }

    const updateData = {
      ...(name && { name }),
      ...(systemPrompt !== undefined && { systemPrompt }),
      ...(conversationGuidelines !== undefined && { conversationGuidelines }),
      ...(initialMessage !== undefined && { initialMessage }),
      ...(voiceId !== undefined && { voiceId }),
      ...(language !== undefined && { language }),
      ...(timezone !== undefined && { timezone }),
      ...(enableWhatsAppConfirmation !== undefined && { enableWhatsAppConfirmation }),
      ...(enableEmailConfirmation !== undefined && { enableEmailConfirmation }),
      ...(tools !== undefined && { tools: parsedTools }),
      ...(whatsappEnabled !== undefined && { whatsappEnabled: !!whatsappEnabled }),
      ...(automationPurpose !== undefined && { automationPurpose }),
      ...(automationStatus !== undefined && { automationStatus }),
      ...(Array.isArray(req.body.allowedEmails) && { allowedEmails: req.body.allowedEmails.map(e => String(e).trim().toLowerCase()).filter(Boolean) }),
    };

    if (providers !== undefined) {
      updateData.providers = providers || null;
    }

    const updatedAgent = await dbService.prisma.agent.update({
      where: { id },
      data: updateData
    });
    res.json(updatedAgent);
  } catch (err) {
    console.error('[Agents API] Error updating agent:', err);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// POST /api/agents/:id/generate-guidelines - Generate AI conversation guidelines
router.post('/:id/generate-guidelines', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const agent = await dbService.prisma.agent.findUnique({
      where: { id }
    });
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Build the agent config shape that the generator expects
    const config = {
      assistantName: agent.name,
      language: agent.language,
      systemPrompt: agent.systemPrompt,
      dataToCollect: agent.tools?.dataToCollect || [],
      customTools: agent.tools?.customTools || []
    };

    const guidelines = await generateConversationGuidelines(config);
    
    if (!guidelines) {
      return res.status(500).json({ error: 'Failed to generate guidelines' });
    }

    const updatedAgent = await dbService.prisma.agent.update({
      where: { id },
      data: { conversationGuidelines: guidelines }
    });

    res.json(updatedAgent);
  } catch (err) {
    console.error('[Agents API] Error generating guidelines:', err);
    res.status(500).json({ error: 'Failed to generate guidelines' });
  }
});

// GET /api/agents/:id/allowed-emails - list invited user emails for an agent
router.get('/:id/allowed-emails', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const agent = await dbService.prisma.agent.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, allowedEmails: true },
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent);
  } catch (err) {
    console.error('[Agents API] Error fetching allowed emails:', err);
    res.status(500).json({ error: 'Failed to load allowed emails' });
  }
});

// PUT /api/agents/:id/allowed-emails
// Body: { emails: [string] }
// For each email: ensures a User row exists (creating one with a random
// temporary password if needed), and stores the lowercased email in
// allowedEmails. Returns the resulting allowedEmails along with credentials
// for any newly created users (so the admin can share them).
router.put('/:id/allowed-emails', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const rawEmails = Array.isArray(req.body?.emails)
      ? req.body.emails.map(e => String(e).trim().toLowerCase()).filter(Boolean)
      : [];

    const agent = await dbService.prisma.agent.findUnique({
      where: { id },
      select: { id: true, name: true, allowedEmails: true },
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const previous = new Set(agent.allowedEmails || []);
    const createdCredentials = [];

    // Only auto-provision users for emails that are NEW to the allowed list
    for (const email of rawEmails) {
      if (previous.has(email)) continue;
      const existing = await dbService.prisma.user.findUnique({ where: { email } });
      if (existing) continue; // already a user, just add to allowedEmails
      const tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      await dbService.prisma.user.create({
        data: { email, passwordHash, role: 'user' },
      });
      createdCredentials.push({ email, tempPassword });
    }

    const updated = await dbService.prisma.agent.update({
      where: { id },
      data: { allowedEmails: rawEmails },
      select: { id: true, name: true, allowedEmails: true },
    });

    res.json({ ...updated, createdCredentials });
  } catch (err) {
    console.error('[Agents API] Error updating allowed emails:', err);
    res.status(500).json({ error: 'Failed to update allowed emails' });
  }
});

// POST /api/agents/:id/allowed-emails/:email/reset-password
// Admin-only: reset a user's password and return the new temporary password
router.post('/:id/allowed-emails/:email/reset-password', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const agentId = req.params.id;
    const email = String(req.params.email).trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const agent = await dbService.prisma.agent.findUnique({
      where: { id: agentId },
      select: { allowedEmails: true },
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!agent.allowedEmails.includes(email)) {
      return res.status(400).json({ error: 'This user is not invited to this agent' });
    }

    const user = await dbService.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'No user account exists for this email yet. Add the email first to auto-create the account.' });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await dbService.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    res.json({ email, tempPassword });
  } catch (err) {
    console.error('[Agents API] Error resetting password:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// GET /api/agents/:id/availability - Get agent availability
router.get('/:id/availability', authenticate, async (req, res) => {
  try {
    if (!(await ensureAgentAccess(req, res))) return;
    const { id } = req.params;
    const availabilities = await dbService.prisma.availability.findMany({
      where: { agentId: id },
      orderBy: { dayOfWeek: 'asc' }
    });
    const agent = await dbService.prisma.agent.findUnique({
      where: { id },
      select: { slotDuration: true }
    });
    res.json({ availabilities, slotDuration: agent?.slotDuration || 60 });
  } catch (err) {
    console.error('[Agents API] Error fetching availability:', err);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// PUT /api/agents/:id/availability - Update agent availability (admin only)
router.put('/:id/availability', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { availabilities, slotDuration } = req.body; // availabilities should be array of { dayOfWeek, startTime, endTime, isActive }

    // Update slot duration on agent
    if (slotDuration) {
      await dbService.prisma.agent.update({
        where: { id },
        data: { slotDuration: parseInt(slotDuration, 10) }
      });
    }

    // Upsert each availability
    if (availabilities && Array.isArray(availabilities)) {
      for (const av of availabilities) {
        await dbService.prisma.availability.upsert({
          where: {
            agentId_dayOfWeek: {
              agentId: id,
              dayOfWeek: av.dayOfWeek
            }
          },
          update: {
            startTime: av.startTime,
            endTime: av.endTime,
            isActive: av.isActive
          },
          create: {
            agentId: id,
            dayOfWeek: av.dayOfWeek,
            startTime: av.startTime,
            endTime: av.endTime,
            isActive: av.isActive
          }
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Agents API] Error updating availability:', err);
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

// DELETE /api/agents/:id - Delete an agent (admin only)
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    await dbService.prisma.agent.delete({
      where: { id }
    });
    res.status(204).send();
  } catch (err) {
    console.error('[Agents API] Error deleting agent:', err);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// POST /api/agents/builder-chat - Handle agent builder chat
const { processBuilderChat } = require('../modules/prompt/agentBuilder');

router.post('/builder-chat', async (req, res) => {
  try {
    const { message, currentConfig, chatHistory } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await processBuilderChat(message, currentConfig || {}, chatHistory || []);
    if (!response) {
      return res.status(500).json({ error: 'Failed to process builder chat' });
    }

    res.json(response);
  } catch (err) {
    console.error('[Agents API] Error in builder chat:', err);
    res.status(500).json({ error: 'Failed to process builder chat' });
  }
});

module.exports = router;
