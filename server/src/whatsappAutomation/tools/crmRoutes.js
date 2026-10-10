const express = require('express');
const { dbService } = require('../../services/DatabaseService');
const crm = require('./crmService');

/** Workspace-scoped REST API for the WhatsApp CRM (mounted at /crm). */
function createCrmRouter(resolveWorkspaceId) {
  const router = express.Router();
  const db = () => dbService.prisma;

  router.use(async (req, res, next) => {
    try {
      req.workspaceId = await resolveWorkspaceId(req);
      if (!req.workspaceId) return res.status(403).json({ error: 'No workspace is configured for this account' });
      next();
    } catch (error) {
      next(error);
    }
  });

  const owned = (req, id) => db().whatsAppCrmContact.findFirst({ where: { id, workspaceId: req.workspaceId } });
  const fail = (res, error) => {
    console.error('[WhatsAppCRM]', error.message);
    res.status(error.code === 'P2025' ? 404 : 400).json({ error: error.message });
  };

  router.get('/summary', async (req, res) => {
    try {
      const workspaceId = req.workspaceId;
      const [stages, openTasks, overdue, deals] = await Promise.all([
        db().whatsAppCrmContact.groupBy({ by: ['stage'], where: { workspaceId }, _count: { _all: true } }),
        db().whatsAppCrmTask.count({ where: { workspaceId, status: 'open' } }),
        db().whatsAppCrmTask.count({ where: { workspaceId, status: 'open', dueAt: { lt: new Date() } } }),
        db().whatsAppCrmDeal.groupBy({ by: ['status'], where: { workspaceId }, _count: { _all: true }, _sum: { value: true } }),
      ]);
      res.json({
        stages: Object.fromEntries(crm.STAGES.map((s) => [s, stages.find((r) => r.stage === s)?._count._all || 0])),
        openTasks, overdueTasks: overdue,
        deals: deals.map((d) => ({ status: d.status, count: d._count._all, value: d._sum.value || 0 })),
      });
    } catch (error) { fail(res, error); }
  });

  router.get('/contacts', async (req, res) => {
    try {
      const { stage, tag, q } = req.query;
      const page = Math.max(1, Number(req.query.page) || 1);
      const take = Math.min(100, Number(req.query.limit) || 25);
      const where = {
        workspaceId: req.workspaceId,
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
        db().whatsAppCrmContact.findMany({
          where, orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } }, skip: (page - 1) * take, take,
          include: { _count: { select: { tasks: { where: { status: 'open' } }, deals: true } } },
        }),
        db().whatsAppCrmContact.count({ where }),
      ]);
      res.json({ contacts, total, page, pageSize: take });
    } catch (error) { fail(res, error); }
  });

  router.get('/contacts/:id', async (req, res) => {
    try {
      if (!(await owned(req, req.params.id))) return res.status(404).json({ error: 'Contact not found' });
      const contact = await db().whatsAppCrmContact.findUnique({
        where: { id: req.params.id },
        include: {
          activities: { orderBy: { createdAt: 'desc' }, take: 100 },
          tasks: { orderBy: [{ status: 'asc' }, { dueAt: 'asc' }] },
          deals: { orderBy: { createdAt: 'desc' } },
        },
      });
      res.json({ contact });
    } catch (error) { fail(res, error); }
  });

  router.patch('/contacts/:id', async (req, res) => {
    try {
      if (!(await owned(req, req.params.id))) return res.status(404).json({ error: 'Contact not found' });
      const { stage, tags, optedOut, ...fields } = req.body || {};
      if (Object.keys(fields).length) await crm.updateContact(req.params.id, fields, 'user');
      if (stage) await crm.setStage(req.params.id, stage, 'Changed by team', 'user');
      if (Array.isArray(tags)) {
        const current = await db().whatsAppCrmContact.findUnique({ where: { id: req.params.id } });
        await crm.changeTags(req.params.id, { add: tags, remove: current.tags }, 'user');
      }
      if (typeof optedOut === 'boolean') await db().whatsAppCrmContact.update({ where: { id: req.params.id }, data: { optedOut } });
      res.json({ contact: await db().whatsAppCrmContact.findUnique({ where: { id: req.params.id } }) });
    } catch (error) { fail(res, error); }
  });

  router.post('/contacts/:id/notes', async (req, res) => {
    try {
      if (!(await owned(req, req.params.id))) return res.status(404).json({ error: 'Contact not found' });
      res.status(201).json({ activity: await crm.addNote(req.params.id, req.body?.note, 'user') });
    } catch (error) { fail(res, error); }
  });

  router.post('/contacts/:id/tasks', async (req, res) => {
    try {
      if (!(await owned(req, req.params.id))) return res.status(404).json({ error: 'Contact not found' });
      res.status(201).json({ task: await crm.createTask({ ...req.body, workspaceId: req.workspaceId, contactId: req.params.id }, 'user') });
    } catch (error) { fail(res, error); }
  });

  router.get('/tasks', async (req, res) => {
    try {
      const status = req.query.status ? String(req.query.status) : 'open';
      const tasks = await db().whatsAppCrmTask.findMany({
        where: { workspaceId: req.workspaceId, status }, orderBy: { dueAt: { sort: 'asc', nulls: 'last' } }, take: 200,
        include: { contact: { select: { id: true, name: true, waId: true } } },
      });
      res.json({ tasks });
    } catch (error) { fail(res, error); }
  });

  router.patch('/tasks/:taskId', async (req, res) => {
    try {
      const task = await db().whatsAppCrmTask.findFirst({ where: { id: req.params.taskId, workspaceId: req.workspaceId } });
      if (!task) return res.status(404).json({ error: 'Task not found' });
      const status = ['open', 'done', 'cancelled'].includes(req.body?.status) ? req.body.status : task.status;
      const updated = await db().whatsAppCrmTask.update({ where: { id: task.id }, data: { status } });
      await crm.logActivity(task.contactId, 'task', `Task ${status}: ${task.title}`, { taskId: task.id }, 'user');
      res.json({ task: updated });
    } catch (error) { fail(res, error); }
  });

  router.post('/contacts/:id/deals', async (req, res) => {
    try {
      if (!(await owned(req, req.params.id))) return res.status(404).json({ error: 'Contact not found' });
      res.status(201).json({ deal: await crm.createDeal({ ...req.body, workspaceId: req.workspaceId, contactId: req.params.id }, 'user') });
    } catch (error) { fail(res, error); }
  });

  router.patch('/deals/:dealId', async (req, res) => {
    try {
      const deal = await db().whatsAppCrmDeal.findFirst({ where: { id: req.params.dealId, workspaceId: req.workspaceId } });
      if (!deal) return res.status(404).json({ error: 'Deal not found' });
      res.json({ deal: await crm.updateDeal(deal.contactId, deal.id, req.body || {}, 'user') });
    } catch (error) { fail(res, error); }
  });

  return router;
}

module.exports = { createCrmRouter };
