const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');

// Get all agents
router.get('/', async (req, res) => {
  try {
    const agents = await prisma.agent.findMany();
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// Get a specific agent
router.get('/:id', async (req, res) => {
  try {
    const agent = await prisma.agent.findUnique({
      where: { id: req.params.id },
      include: { phoneNumbers: true }
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
});

// Create a new agent
router.post('/', async (req, res) => {
  try {
    const { name, systemPrompt, initialMessage, voiceId, tools } = req.body;
    const agent = await prisma.agent.create({
      data: { name, systemPrompt, initialMessage, voiceId, tools }
    });
    res.status(201).json(agent);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// Update an agent
router.put('/:id', async (req, res) => {
  try {
    const { name, systemPrompt, initialMessage, voiceId, tools } = req.body;
    const agent = await prisma.agent.update({
      where: { id: req.params.id },
      data: { name, systemPrompt, initialMessage, voiceId, tools }
    });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

module.exports = router;
