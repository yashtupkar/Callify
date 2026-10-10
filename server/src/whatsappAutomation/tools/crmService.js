const { dbService } = require('../../services/DatabaseService');

const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
const TASK_KINDS = ['followup', 'appointment', 'callback', 'other'];

const db = () => dbService.prisma;
const clean = (value, max = 500) => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim().slice(0, max);
  return text || undefined;
};

function normalizeKind(kind) {
  const slug = String(kind || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
  return slug || 'followup';
}

function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : [];
  return [...new Set(list.map((tag) => String(tag).trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 20);
}

/** Find or create the CRM record for a WhatsApp customer. Safe to call on every message. */
async function ensureContact({ workspaceId, automationId, waId, name }) {
  if (!workspaceId || !waId) return null;
  const where = { workspaceId_waId: { workspaceId, waId: String(waId) } };
  const profileName = clean(name, 120);
  const existing = await db().whatsAppCrmContact.findUnique({ where });
  if (existing) {
    const data = { lastMessageAt: new Date() };
    if (!existing.name && profileName) data.name = profileName;
    return db().whatsAppCrmContact.update({ where, data });
  }
  try {
    const created = await db().whatsAppCrmContact.create({
      data: { workspaceId, automationId: automationId || null, waId: String(waId), name: profileName || null, lastMessageAt: new Date() },
    });
    await logActivity(created.id, 'update', 'Contact created from WhatsApp conversation', null, 'ai');
    return created;
  } catch (error) {
    if (error.code === 'P2002') return db().whatsAppCrmContact.findUnique({ where });
    throw error;
  }
}

async function recordMessage(contactId, count = 1) {
  if (!contactId) return;
  await db().whatsAppCrmContact.update({
    where: { id: contactId },
    data: { messageCount: { increment: count }, lastMessageAt: new Date() },
  }).catch(() => {});
}

function logActivity(contactId, type, content, metadata = null, createdBy = 'ai') {
  return db().whatsAppCrmActivity.create({
    data: { contactId, type, content: String(content).slice(0, 2000), metadata: metadata || undefined, createdBy },
  });
}

async function updateContact(contactId, fields, createdBy = 'ai') {
  const current = await db().whatsAppCrmContact.findUnique({ where: { id: contactId } });
  if (!current) throw new Error('Contact not found');
  const data = {};
  for (const [key, max] of [['name', 120], ['email', 160], ['company', 160], ['city', 120]]) {
    const value = clean(fields[key], max);
    if (value !== undefined) data[key] = value;
  }
  if (fields.customFields && typeof fields.customFields === 'object' && !Array.isArray(fields.customFields)) {
    const merged = { ...(current.customFields || {}) };
    for (const [key, value] of Object.entries(fields.customFields).slice(0, 30)) {
      merged[String(key).slice(0, 60)] = typeof value === 'string' ? value.slice(0, 500) : value;
    }
    data.customFields = merged;
  }
  if (!Object.keys(data).length) return current;
  const updated = await db().whatsAppCrmContact.update({ where: { id: contactId }, data });
  await logActivity(contactId, 'update', `Updated ${Object.keys(data).join(', ')}`, data, createdBy);
  return updated;
}

async function setStage(contactId, stage, reason, createdBy = 'ai') {
  if (!STAGES.includes(stage)) throw new Error(`Invalid stage. Use one of: ${STAGES.join(', ')}`);
  const current = await db().whatsAppCrmContact.findUnique({ where: { id: contactId } });
  if (!current) throw new Error('Contact not found');
  if (current.stage === stage) return current;
  const updated = await db().whatsAppCrmContact.update({ where: { id: contactId }, data: { stage } });
  await logActivity(contactId, 'stage_change', `Stage changed from ${current.stage} to ${stage}${reason ? `: ${reason}` : ''}`, { from: current.stage, to: stage }, createdBy);
  return updated;
}

async function changeTags(contactId, { add = [], remove = [] }, createdBy = 'ai') {
  const current = await db().whatsAppCrmContact.findUnique({ where: { id: contactId } });
  if (!current) throw new Error('Contact not found');
  const toAdd = normalizeTags(add);
  const toRemove = new Set(normalizeTags(remove));
  const tags = [...new Set([...current.tags, ...toAdd])].filter((tag) => !toRemove.has(tag)).slice(0, 30);
  const updated = await db().whatsAppCrmContact.update({ where: { id: contactId }, data: { tags } });
  await logActivity(contactId, 'tags', `Tags updated: +[${toAdd.join(', ')}] -[${[...toRemove].join(', ')}]`, { tags }, createdBy);
  return updated;
}

async function addNote(contactId, content, createdBy = 'ai') {
  const text = clean(content, 2000);
  if (!text) throw new Error('Note content is required');
  return logActivity(contactId, 'note', text, null, createdBy);
}

async function createTask({ workspaceId, contactId, title, description, kind, dueAt }, createdBy = 'ai') {
  const taskTitle = clean(title, 200);
  if (!taskTitle) throw new Error('Task title is required');
  let due = null;
  if (dueAt) {
    due = new Date(dueAt);
    if (Number.isNaN(due.getTime())) throw new Error('dueAt must be an ISO 8601 date-time');
  }
  const task = await db().whatsAppCrmTask.create({
    data: {
      workspaceId, contactId, title: taskTitle, description: clean(description, 1000) || null,
      kind: normalizeKind(kind), dueAt: due, createdBy,
    },
  });
  await logActivity(contactId, 'task', `Task created: ${taskTitle}${due ? ` (due ${due.toISOString()})` : ''}`, { taskId: task.id, kind: task.kind }, createdBy);
  return task;
}

async function completeTask(contactId, taskId, createdBy = 'ai') {
  const task = await db().whatsAppCrmTask.findFirst({ where: { id: taskId, contactId } });
  if (!task) throw new Error('Task not found for this contact');
  const updated = await db().whatsAppCrmTask.update({ where: { id: task.id }, data: { status: 'done' } });
  await logActivity(contactId, 'task', `Task completed: ${task.title}`, { taskId: task.id }, createdBy);
  return updated;
}

async function createDeal({ workspaceId, contactId, title, value, currency, notes }, createdBy = 'ai') {
  const dealTitle = clean(title, 200);
  if (!dealTitle) throw new Error('Deal title is required');
  const amount = value === undefined || value === null || value === '' ? null : Number(value);
  if (amount !== null && !Number.isFinite(amount)) throw new Error('value must be a number');
  const deal = await db().whatsAppCrmDeal.create({
    data: { workspaceId, contactId, title: dealTitle, value: amount, currency: clean(currency, 3)?.toUpperCase() || 'INR', notes: clean(notes, 1000) || null, createdBy },
  });
  await logActivity(contactId, 'deal', `Deal created: ${dealTitle}${amount !== null ? ` (${deal.currency} ${amount})` : ''}`, { dealId: deal.id }, createdBy);
  return deal;
}

async function updateDeal(contactId, dealId, { status, value, notes }, createdBy = 'ai') {
  const deal = await db().whatsAppCrmDeal.findFirst({ where: { id: dealId, contactId } });
  if (!deal) throw new Error('Deal not found for this contact');
  const data = {};
  if (['open', 'won', 'lost'].includes(status)) data.status = status;
  if (value !== undefined && value !== null && Number.isFinite(Number(value))) data.value = Number(value);
  if (notes !== undefined) data.notes = clean(notes, 1000) || null;
  const updated = await db().whatsAppCrmDeal.update({ where: { id: deal.id }, data });
  await logActivity(contactId, 'deal', `Deal updated: ${deal.title} (${Object.keys(data).join(', ') || 'no changes'})`, { dealId: deal.id, ...data }, createdBy);
  return updated;
}

/** Compact profile the LLM can read: details, open tasks/deals and latest activity. */
async function getProfile(contactId) {
  const contact = await db().whatsAppCrmContact.findUnique({
    where: { id: contactId },
    include: {
      activities: { orderBy: { createdAt: 'desc' }, take: 8 },
      tasks: { where: { status: 'open' }, orderBy: { dueAt: 'asc' }, take: 10 },
      deals: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });
  if (!contact) throw new Error('Contact not found');
  return {
    id: contact.id,
    phone: contact.waId,
    name: contact.name,
    email: contact.email,
    company: contact.company,
    city: contact.city,
    stage: contact.stage,
    tags: contact.tags,
    customFields: contact.customFields || {},
    messageCount: contact.messageCount,
    openTasks: contact.tasks.map((t) => ({ id: t.id, title: t.title, kind: t.kind, dueAt: t.dueAt })),
    deals: contact.deals.map((d) => ({ id: d.id, title: d.title, value: d.value, currency: d.currency, status: d.status })),
    recentActivity: contact.activities.map((a) => ({ type: a.type, content: a.content, at: a.createdAt })),
  };
}

module.exports = {
  STAGES, TASK_KINDS, ensureContact, recordMessage, logActivity, updateContact, setStage,
  changeTags, addNote, createTask, completeTask, createDeal, updateDeal, getProfile,
};
