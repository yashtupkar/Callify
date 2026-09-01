const express = require('express');
const router = express.Router();
const { dbService } = require('../services/DatabaseService');
const { generateConversationGuidelines } = require('../modules/prompt/conversationGuidelineGenerator');

// GET /api/agents - List all agents
router.get('/', async (req, res) => {
  try {
    const agents = await dbService.prisma.agent.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(agents);
  } catch (err) {
    console.error('[Agents API] Error fetching agents:', err);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// POST /api/agents - Create a new agent
router.post('/', async (req, res) => {
  try {
    const { name, systemPrompt, conversationGuidelines, initialMessage, voiceId, language, timezone, enableWhatsAppConfirmation, enableEmailConfirmation, tools } = req.body;
    
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
      }
    });
    res.status(201).json(newAgent);
  } catch (err) {
    console.error('[Agents API] Error creating agent:', err);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// PUT /api/agents/:id - Update an agent
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, systemPrompt, conversationGuidelines, initialMessage, voiceId, language, timezone, enableWhatsAppConfirmation, enableEmailConfirmation, tools } = req.body;
    
    let parsedTools = null;
    if (typeof tools === 'string') {
      try { parsedTools = JSON.parse(tools); } catch(e) {}
    } else if (tools) {
      parsedTools = tools;
    }

    const updatedAgent = await dbService.prisma.agent.update({
      where: { id },
      data: {
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
      }
    });
    res.json(updatedAgent);
  } catch (err) {
    console.error('[Agents API] Error updating agent:', err);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// POST /api/agents/:id/generate-guidelines - Generate AI conversation guidelines
router.post('/:id/generate-guidelines', async (req, res) => {
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

// GET /api/agents/:id/availability - Get agent availability
router.get('/:id/availability', async (req, res) => {
  try {
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

// PUT /api/agents/:id/availability - Update agent availability
router.put('/:id/availability', async (req, res) => {
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

// DELETE /api/agents/:id - Delete an agent
router.delete('/:id', async (req, res) => {
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
