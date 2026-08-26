const express = require('express');
const router = express.Router();
const { dbService } = require('../services/DatabaseService');

// GET /api/crm/agents/:agentId/contacts
router.get('/agents/:agentId/contacts', async (req, res) => {
  try {
    const contacts = await dbService.prisma.contact.findMany({
      where: { agentId: req.params.agentId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(contacts);
  } catch (err) {
    console.error('[CRM API] Error fetching contacts:', err);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// GET /api/crm/agents/:agentId/bookings
// Query params: ?all=true to include cancelled bookings (default: confirmed only)
router.get('/agents/:agentId/bookings', async (req, res) => {
  try {
    const showAll = req.query.all === 'true';
    const whereClause = { agentId: req.params.agentId };
    if (!showAll) whereClause.status = { not: 'cancelled' };

    const bookings = await dbService.prisma.booking.findMany({
      where: whereClause,
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
router.get('/agents/:agentId/availability', async (req, res) => {
  try {
    const availability = await dbService.prisma.availability.findMany({
      where: { agentId: req.params.agentId }
    });
    res.json(availability);
  } catch (err) {
    console.error('[CRM API] Error fetching availability:', err);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// PUT /api/crm/agents/:agentId/availability
router.put('/agents/:agentId/availability', async (req, res) => {
  try {
    const { agentId } = req.params;
    const availabilities = req.body; // Array of availability objects

    // Delete existing and insert new (simple sync)
    await dbService.prisma.availability.deleteMany({
      where: { agentId }
    });

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

module.exports = router;
