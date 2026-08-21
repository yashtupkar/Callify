const express = require('express');
const store = require('../services/agentStore');
const { TOOL_CATALOG } = require('../tools/toolRegistry');

const router = express.Router();

router.get('/tools', (req, res) => {
  res.json(TOOL_CATALOG);
});

router.get('/agents', (req, res) => {
  res.json(store.listAgents());
});

router.post('/agents', (req, res) => {
  const agent = store.createAgent(req.body || {});
  res.status(201).json(agent);
});

router.get('/agents/:id', (req, res) => {
  const agent = store.getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

router.put('/agents/:id', (req, res) => {
  const agent = store.updateAgent(req.params.id, req.body || {});
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

router.delete('/agents/:id', (req, res) => {
  const ok = store.deleteAgent(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Agent not found' });
  res.status(204).end();
});

module.exports = router;
