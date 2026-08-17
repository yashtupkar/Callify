const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');

// --- Phone Number Routes ---
// Get all phone numbers
router.get('/phone-numbers', async (req, res) => {
  try {
    const numbers = await prisma.phoneNumber.findMany({
      include: { agent: true }
    });
    res.json(numbers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch phone numbers' });
  }
});

// Create a new phone number mapping
router.post('/phone-numbers', async (req, res) => {
  try {
    const { phoneNumber, agentId } = req.body;
    const newNumber = await prisma.phoneNumber.create({
      data: { phoneNumber, agentId }
    });
    res.status(201).json(newNumber);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add phone number' });
  }
});

// Delete a phone number mapping
router.delete('/phone-numbers/:id', async (req, res) => {
  try {
    await prisma.phoneNumber.delete({
      where: { id: req.params.id }
    });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete phone number' });
  }
});

// --- Agent Routes ---
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
