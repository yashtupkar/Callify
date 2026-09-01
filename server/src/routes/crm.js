const express = require('express');
const router = express.Router();
const { dbService } = require('../services/DatabaseService');
const { authenticate } = require('../middleware/auth');

// All CRM endpoints require authentication. Admins see everything.
// Users only see data for agents that include their email in allowedEmails.
function scopeAgentsForUser(user) {
  return user.role === 'admin' ? {} : { allowedEmails: { has: user.email } };
}

async function ensureAgentAccess(req, res) {
  const { agentId } = req.params;
  if (req.user.role === 'admin') return true;
  if (agentId === 'all') return true;
  const agent = await dbService.prisma.agent.findUnique({
    where: { id: agentId },
    select: { allowedEmails: true },
  });
  if (!agent) {
    res.status(404).json({ error: 'Agent not found' });
    return false;
  }
  if (!agent.allowedEmails.includes(req.user.email)) {
    res.status(403).json({ error: 'Forbidden: no access to this agent' });
    return false;
  }
  return true;
}

// GET /api/crm/agents/:agentId/contacts
router.get('/agents/:agentId/contacts', authenticate, async (req, res) => {
  try {
    if (!(await ensureAgentAccess(req, res))) return;
    const where = { agentId: req.params.agentId };
    if (req.user.role !== 'admin') {
      where.agent = scopeAgentsForUser(req.user);
    }
    const contacts = await dbService.prisma.contact.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    res.json(contacts);
  } catch (err) {
    console.error('[CRM API] Error fetching contacts:', err);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// GET /api/crm/agents/:agentId/bookings
// Query params: ?all=true to include cancelled bookings
router.get('/agents/:agentId/bookings', authenticate, async (req, res) => {
  try {
    if (!(await ensureAgentAccess(req, res))) return;
    const showAll = req.query.all === 'true';
    const where = { agentId: req.params.agentId };
    if (!showAll) where.status = { not: 'cancelled' };
    if (req.user.role !== 'admin') {
      where.agent = scopeAgentsForUser(req.user);
    }
    const bookings = await dbService.prisma.booking.findMany({
      where,
      include: { contact: true },
      orderBy: { startTime: 'asc' }
    });
    res.json(bookings);
  } catch (err) {
    console.error('[CRM API] Error fetching bookings:', err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// GET /api/crm/agents/:agentId/availability
router.get('/agents/:agentId/availability', authenticate, async (req, res) => {
  try {
    if (!(await ensureAgentAccess(req, res))) return;
    const where = { agentId: req.params.agentId };
    if (req.user.role !== 'admin') {
      where.agent = scopeAgentsForUser(req.user);
    }
    const availability = await dbService.prisma.availability.findMany({
      where
    });
    res.json(availability);
  } catch (err) {
    console.error('[CRM API] Error fetching availability:', err);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// PUT /api/crm/agents/:agentId/availability
router.put('/agents/:agentId/availability', authenticate, async (req, res) => {
  try {
    if (!(await ensureAgentAccess(req, res))) return;
    const { agentId } = req.params;
    const availabilities = req.body;

    await dbService.prisma.availability.deleteMany({ where: { agentId } });

    const created = await Promise.all(
      availabilities.map(a =>
        dbService.prisma.availability.create({
          data: {
            agentId,
            dayOfWeek: a.dayOfWeek,
            startTime: a.startTime,
            endTime: a.endTime,
            isActive: a.isActive
          }
        })
      )
    );

    res.json(created);
  } catch (err) {
    console.error('[CRM API] Error updating availability:', err);
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

// GET /api/crm/my-agents - returns the agents the user has access to (admins get all)
router.get('/my-agents', authenticate, async (req, res) => {
  try {
    const where = scopeAgentsForUser(req.user);
    const agents = await dbService.prisma.agent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, language: true, systemPrompt: true },
    });
    res.json(agents);
  } catch (err) {
    console.error('[CRM API] Error fetching my-agents:', err);
    res.status(500).json({ error: 'Failed to load agents' });
  }
});

module.exports = router;
