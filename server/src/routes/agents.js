const express = require('express');
const router = express.Router();
const { dbService } = require('../services/DatabaseService');

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
    const { name, systemPrompt, initialMessage, voiceId, tools } = req.body;
    
    // Fallback if tools is string, try parsing or default to empty
    let parsedTools = null;
    if (typeof tools === 'string') {
      try { parsedTools = JSON.parse(tools); } catch(e) {}
    } else {
      parsedTools = tools;
    }

    const newAgent = await dbService.prisma.agent.create({
      data: {
        name: name || 'Custom Agent',
        systemPrompt: systemPrompt || '',
        initialMessage: initialMessage || 'Hello!',
        voiceId: voiceId || null,
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
    const { name, systemPrompt, initialMessage, voiceId, tools } = req.body;
    
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
        ...(systemPrompt && { systemPrompt }),
        ...(initialMessage && { initialMessage }),
        ...(voiceId !== undefined && { voiceId }),
        ...(tools !== undefined && { tools: parsedTools }),
      }
    });
    res.json(updatedAgent);
  } catch (err) {
    console.error('[Agents API] Error updating agent:', err);
    res.status(500).json({ error: 'Failed to update agent' });
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

module.exports = router;
