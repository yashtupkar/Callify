const express = require('express');
const { dbService } = require('../../services/DatabaseService');
const crm = require('./crmService');
const { createWhatsAppAutomationProvider } = require('../factory');
const { store } = require('../sessionStore');

/** Automation-scoped REST API for the WhatsApp CRM (mounted at /:automationId/crm). */
function createCrmRouter(resolveAutomationId) {
  const router = express.Router({ mergeParams: true });
  const db = () => dbService.prisma;

  router.use(async (req, res, next) => {
    try {
      req.automationId = await resolveAutomationId(req);
      if (!req.automationId) return res.status(403).json({ error: 'No automation is configured for this account' });
      next();
    } catch (error) {
      next(error);
    }
  });

  const ownedContact = (req, id) => db().automationContact.findFirst({ where: { id, automationId: req.automationId } });
  const fail = (res, error) => {
    console.error('[WhatsAppCRM]', error.message);
    res.status(error.code === 'P2025' ? 404 : 400).json({ error: error.message });
  };

  router.get('/summary', async (req, res) => {
    try {
      const automationId = req.automationId;
      const [stages, openRecords, overdue] = await Promise.all([
        db().automationContact.groupBy({ by: ['stage'], where: { automationId }, _count: { _all: true } }),
        db().automationRecord.count({ where: { automationId, status: 'open' } }),
        db().automationRecord.count({ where: { automationId, status: 'open', dueDate: { lt: new Date() } } }),
      ]);
      res.json({
        stages: Object.fromEntries(crm.STAGES.map((s) => [s, stages.find((r) => r.stage === s)?._count._all || 0])),
        openRecords, overdueRecords: overdue,
      });
    } catch (error) { fail(res, error); }
  });

  router.get('/contacts', async (req, res) => {
    try {
      const { stage, tag, q } = req.query;
      const page = Math.max(1, Number(req.query.page) || 1);
      const take = Math.min(100, Number(req.query.limit) || 25);
      const where = {
        automationId: req.automationId,
        ...(stage ? { stage: String(stage) } : {}),
        ...(tag ? { tags: { has: String(tag).toLowerCase() } } : {}),
        ...(q ? { OR: [
          { name: { contains: String(q), mode: 'insensitive' } },
          { waId: { contains: String(q) } },
          { email: { contains: String(q), mode: 'insensitive' } },
          { company: { contains: String(q), mode: 'insensitive' } },
        ] } : {}),
      };
      const [contacts, total] = await Promise.all([
        db().automationContact.findMany({
          where, orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } }, skip: (page - 1) * take, take,
          include: { _count: { select: { records: { where: { status: 'open' } } } } },
        }),
        db().automationContact.count({ where }),
      ]);
      res.json({ contacts, total, page, pageSize: take });
    } catch (error) { fail(res, error); }
  });

  router.get('/contacts/:id', async (req, res) => {
    try {
      if (!(await ownedContact(req, req.params.id))) return res.status(404).json({ error: 'Contact not found' });
      const contact = await db().automationContact.findUnique({
        where: { id: req.params.id },
        include: {
          activities: { orderBy: { createdAt: 'desc' }, take: 100 },
          records: { orderBy: [{ status: 'asc' }, { dueDate: 'asc' }] },
        },
      });
      res.json({ contact });
    } catch (error) { fail(res, error); }
  });

  router.patch('/contacts/:id', async (req, res) => {
    try {
      if (!(await ownedContact(req, req.params.id))) return res.status(404).json({ error: 'Contact not found' });
      const { stage, tags, optedOut, ...fields } = req.body || {};
      if (Object.keys(fields).length) await crm.updateContact(req.params.id, fields, 'user');
      if (stage) await crm.setStage(req.params.id, stage, 'Changed by team', 'user');
      if (Array.isArray(tags)) {
        const current = await db().automationContact.findUnique({ where: { id: req.params.id } });
        await crm.changeTags(req.params.id, { add: tags, remove: current.tags }, 'user');
      }
      if (typeof optedOut === 'boolean') await db().automationContact.update({ where: { id: req.params.id }, data: { optedOut } });
      res.json({ contact: await db().automationContact.findUnique({ where: { id: req.params.id } }) });
    } catch (error) { fail(res, error); }
  });

  router.post('/contacts/:id/notes', async (req, res) => {
    try {
      if (!(await ownedContact(req, req.params.id))) return res.status(404).json({ error: 'Contact not found' });
      res.status(201).json({ activity: await crm.addNote(req.params.id, req.body?.note, 'user') });
    } catch (error) { fail(res, error); }
  });

  router.get('/records', async (req, res) => {
    try {
      const status = req.query.status ? String(req.query.status) : 'open';
      const type = req.query.type ? String(req.query.type) : undefined;
      const records = await db().automationRecord.findMany({
        where: { automationId: req.automationId, status, ...(type ? { type } : {}) }, 
        orderBy: { dueDate: { sort: 'asc', nulls: 'last' } }, take: 200,
        include: { contact: { select: { id: true, name: true, waId: true } } },
      });
      res.json({ records });
    } catch (error) { fail(res, error); }
  });

  router.patch('/records/:recordId', async (req, res) => {
    try {
      const record = await db().automationRecord.findFirst({ where: { id: req.params.recordId, automationId: req.automationId } });
      if (!record) return res.status(404).json({ error: 'Record not found' });
      if (req.body?.status) {
        await crm.updateRecordStatus(record.contactId, record.reference, req.body.status, 'user');
      }
      res.json({ record: await db().automationRecord.findUnique({ where: { id: record.id } }) });
    } catch (error) { fail(res, error); }
  });

  router.post('/contacts/:id/message', async (req, res) => {
    try {
      const contact = await ownedContact(req, req.params.id);
      if (!contact) return res.status(404).json({ error: 'Contact not found' });
      
      const text = req.body?.text;
      if (!text) return res.status(400).json({ error: 'Message text is required' });

      // Find an active connection for this automation
      const connection = await db().whatsAppConnection.findFirst({
        where: { automationId: req.automationId, enabled: true }
      });
      if (!connection) return res.status(400).json({ error: 'No active WhatsApp connection for this automation' });

      const provider = await createWhatsAppAutomationProvider(connection);
      if (!provider) return res.status(500).json({ error: 'Failed to initialize WhatsApp provider' });

      await provider.sendText(contact.waId, text);
      
      await crm.logActivity(req.automationId, contact.id, null, 'message', `Sent: ${text}`, null, 'user');

      // Sync message into active session transcript so LLM retains conversation context
      try {
        const sessionEntry = store.get(connection.id, contact.waId);
        if (sessionEntry?.conversationManager?.transcript) {
          sessionEntry.conversationManager.transcript.push({
            role: 'assistant',
            content: text,
            metadata: { sentBy: 'human_operator' },
          });
          const automation = await db().whatsAppAutomation.findUnique({ where: { id: req.automationId } });
          if (automation) await store.set(connection, automation, contact.waId, sessionEntry);
        }
      } catch (syncErr) {
        console.warn('[WhatsAppCRM] Failed to sync manual message to transcript:', syncErr.message);
      }

      res.json({ success: true });
    } catch (error) { fail(res, error); }
  });

  return router;
}

module.exports = { createCrmRouter };
