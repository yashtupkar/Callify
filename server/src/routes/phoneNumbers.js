const express = require('express');
const router = express.Router();
const { dbService } = require('../services/DatabaseService');
const crypto = require('crypto');

// GET /api/phonenumbers
router.get('/', async (req, res) => {
  try {
    const phoneNumbers = await dbService.prisma.phoneNumber.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(phoneNumbers);
  } catch (err) {
    console.error('[PhoneNumbers API] Error fetching:', err);
    res.status(500).json({ error: 'Failed to fetch phone numbers' });
  }
});

// POST /api/phonenumbers
router.post('/', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber is required' });

    const newPhone = await dbService.prisma.phoneNumber.create({
      data: {
        id: crypto.randomUUID(),
        phoneNumber,
        updatedAt: new Date()
      }
    });
    res.status(201).json(newPhone);
  } catch (err) {
    console.error('[PhoneNumbers API] Error creating:', err);
    if (err.code === 'P2002') {
        res.status(400).json({ error: 'Phone number already exists' });
    } else {
        res.status(500).json({ error: 'Failed to create phone number' });
    }
  }
});

// PUT /api/phonenumbers/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { agentId } = req.body;
    
    const updatedPhone = await dbService.prisma.phoneNumber.update({
      where: { id },
      data: {
        agentId: agentId || null,
        updatedAt: new Date()
      }
    });
    res.json(updatedPhone);
  } catch (err) {
    console.error('[PhoneNumbers API] Error updating:', err);
    res.status(500).json({ error: 'Failed to update phone number' });
  }
});

// DELETE /api/phonenumbers/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await dbService.prisma.phoneNumber.delete({
      where: { id }
    });
    res.status(204).send();
  } catch (err) {
    console.error('[PhoneNumbers API] Error deleting:', err);
    res.status(500).json({ error: 'Failed to delete phone number' });
  }
});

module.exports = router;
