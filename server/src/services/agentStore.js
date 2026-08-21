const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'agents.json');

const DEFAULT_AGENT = {
  name: 'Receptionist',
  firstMessage: "Hi, thanks for calling! You've reached our reception desk. How can I help you today?",
  systemPrompt: 'You are a friendly and professional AI receptionist for a local clinic. You can answer questions, check the calendar, and book appointments.',
  model: process.env.VOICE_LLM_MODEL || 'openai/gpt-4o-mini',
  temperature: 0.7,
  voice: { provider: process.env.TTS_PROVIDER === 'fish' ? 'fish' : 'elevenlabs', voiceId: '' },
  tools: [
    { type: 'calendar', enabled: true, config: {} },
    { type: 'end_call', enabled: true, config: {} },
  ],
};

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { agents: [] };
  }
}

function save(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listAgents() {
  return load().agents;
}

function getAgent(id) {
  return load().agents.find((a) => a.id === id) || null;
}

function createAgent(data = {}) {
  const db = load();
  const agent = {
    ...DEFAULT_AGENT,
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.agents.push(agent);
  save(db);
  return agent;
}

function updateAgent(id, data = {}) {
  const db = load();
  const idx = db.agents.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  db.agents[idx] = { ...db.agents[idx], ...data, id, updatedAt: new Date().toISOString() };
  save(db);
  return db.agents[idx];
}

function deleteAgent(id) {
  const db = load();
  const before = db.agents.length;
  db.agents = db.agents.filter((a) => a.id !== id);
  save(db);
  return db.agents.length < before;
}

// Ensure at least one agent exists so the demo works out of the box
function ensureDefaultAgent() {
  const db = load();
  if (db.agents.length === 0) {
    return createAgent({});
  }
  return db.agents[0];
}

module.exports = { listAgents, getAgent, createAgent, updateAgent, deleteAgent, ensureDefaultAgent, DEFAULT_AGENT };
