const crypto = require('crypto');
const { dbService } = require('../../services/DatabaseService');

const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
const TASK_KINDS = ['followup', 'appointment', 'callback', 'other'];

const db = () => dbService.prisma;

function generateReference(prefix = 'REQ') {
  const p = String(prefix || 'REQ').trim().slice(0, 4).toUpperCase();
  const time = Date.now().toString(36).slice(-4).toUpperCase();
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${p}-${time}-${rand}`;
}
const clean = (value, max = 500) => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim().slice(0, max);
  return text || undefined;
};

function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : [];
  return [...new Set(list.map((tag) => String(tag).trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 20);
}

/** Find or create the CRM record for a WhatsApp customer. */
async function ensureContact({ automationId, waId, name }) {
  if (!automationId || !waId) return null;
  const where = { automationId_waId: { automationId, waId: String(waId) } };
  const profileName = clean(name, 120);
  const existing = await db().automationContact.findUnique({ where });
  if (existing) {
    const data = { lastMessageAt: new Date() };
    if (!existing.name && profileName) data.name = profileName;
    return db().automationContact.update({ where, data });
  }
  try {
    const created = await db().automationContact.create({
      data: { automationId, waId: String(waId), name: profileName || null, lastMessageAt: new Date() },
    });
    await logActivity(automationId, created.id, null, 'update', 'Contact created from WhatsApp conversation', null, 'ai');
    return created;
  } catch (error) {
    if (error.code === 'P2002') return db().automationContact.findUnique({ where });
    throw error;
  }
}

async function recordMessage(contactId, count = 1) {
  if (!contactId) return;
  await db().automationContact.update({
    where: { id: contactId },
    data: { messageCount: { increment: count }, lastMessageAt: new Date() },
  }).catch(() => {});
}

function logActivity(automationId, contactId, recordId, type, content, metadata = null, createdBy = 'ai') {
  return db().automationActivity.create({
    data: { automationId, contactId, recordId, type, content: String(content).slice(0, 2000), metadata: metadata || undefined, createdBy },
  });
}

async function updateContact(contactId, fields, createdBy = 'ai') {
  const current = await db().automationContact.findUnique({ where: { id: contactId } });
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
  const updated = await db().automationContact.update({ where: { id: contactId }, data });
  await logActivity(current.automationId, contactId, null, 'update', `Updated ${Object.keys(data).join(', ')}`, data, createdBy);
  return updated;
}

async function setStage(contactId, stage, reason, createdBy = 'ai') {
  if (!STAGES.includes(stage)) throw new Error(`Invalid stage. Use one of: ${STAGES.join(', ')}`);
  const current = await db().automationContact.findUnique({ where: { id: contactId } });
  if (!current) throw new Error('Contact not found');
  if (current.stage === stage) return current;
  const updated = await db().automationContact.update({ where: { id: contactId }, data: { stage } });
  await logActivity(current.automationId, contactId, null, 'stage_change', `Stage changed from ${current.stage} to ${stage}${reason ? `: ${reason}` : ''}`, { from: current.stage, to: stage }, createdBy);
  return updated;
}

async function changeTags(contactId, { add = [], remove = [] }, createdBy = 'ai') {
  const current = await db().automationContact.findUnique({ where: { id: contactId } });
  if (!current) throw new Error('Contact not found');
  const toAdd = normalizeTags(add);
  const toRemove = new Set(normalizeTags(remove));
  const tags = [...new Set([...current.tags, ...toAdd])].filter((tag) => !toRemove.has(tag)).slice(0, 30);
  const updated = await db().automationContact.update({ where: { id: contactId }, data: { tags } });
  await logActivity(current.automationId, contactId, null, 'tags', `Tags updated: +[${toAdd.join(', ')}] -[${[...toRemove].join(', ')}]`, { tags }, createdBy);
  return updated;
}

async function addNote(contactId, content, createdBy = 'ai') {
  const current = await db().automationContact.findUnique({ where: { id: contactId } });
  if (!current) throw new Error('Contact not found');
  const text = clean(content, 2000);
  if (!text) throw new Error('Note content is required');
  return logActivity(current.automationId, contactId, null, 'note', text, null, createdBy);
}

/** Generic record creation (replaces createTask and createDeal) */
async function createRecord({ automationId, contactId, type, title, reference, fields, dueDate }, createdBy = 'ai') {
  const recordTitle = clean(title, 200);
  if (!recordTitle) throw new Error('Record title is required');
  let due = null;
  if (dueDate) {
    due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) throw new Error('dueDate must be an ISO 8601 date-time');
  }

  // Idempotency check: if an identical record was created for this contact within the last 10 minutes, return it
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const existing = await db().automationRecord.findFirst({
      where: {
        automationId,
        contactId,
        type: clean(type, 50) || 'other',
        title: recordTitle,
        createdAt: { gte: tenMinutesAgo },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      console.log(`[CRMService] Idempotent hit: returning existing record ${existing.reference} for ${recordTitle}`);
      return existing;
    }
  } catch (idempErr) {
    // Non-fatal if table index or query fails in mock test environment
  }

  // Attempt creation with retry on reference collision
  let attempts = 0;
  while (attempts < 5) {
    attempts += 1;
    const ref = reference && attempts === 1
      ? String(reference).trim().slice(0, 30)
      : generateReference(type);

    try {
      const record = await db().automationRecord.create({
        data: {
          automationId, contactId, type: clean(type, 50) || 'other', title: recordTitle, 
          reference: ref, fields: fields || {}, dueDate: due, createdBy,
        },
      });
      await logActivity(automationId, contactId, record.id, 'record_created', `Record created: ${recordTitle}${due ? ` (due ${due.toISOString()})` : ''}`, { recordId: record.id, type: record.type }, createdBy);
      return record;
    } catch (err) {
      if (err.code === 'P2002' && attempts < 5) {
        console.warn(`[CRMService] Reference ${ref} collided, retrying... (attempt ${attempts})`);
        continue;
      }
      throw err;
    }
  }
}

async function updateRecordStatus(contactId, reference, status, createdBy = 'ai') {
  const ref = String(reference).trim().toUpperCase();
  const record = await db().automationRecord.findFirst({ where: { reference: ref, contactId } });
  if (!record) throw new Error('Record not found for this contact');
  const updated = await db().automationRecord.update({ where: { id: record.id }, data: { status } });
  await logActivity(record.automationId, contactId, record.id, 'record_updated', `Record status changed to ${status}: ${record.title}`, { recordId: record.id, status }, createdBy);
  return updated;
}

async function getRecordByReference(reference, automationId = null) {
  if (!reference) return null;
  const ref = String(reference).trim().toUpperCase();
  const where = { reference: ref };
  if (automationId) where.automationId = automationId;

  const record = await db().automationRecord.findFirst({
    where,
    include: { contact: { select: { name: true, waId: true } } },
  });
  if (!record) return null;
  return {
    reference: record.reference,
    title: record.title,
    type: record.type,
    status: record.status,          
    dueDate: record.dueDate,
    createdAt: record.createdAt,
    fields: record.fields,
    contact: record.contact?.name || record.contact?.waId || null,
  };
}

async function getProfile(contactId) {
  const contact = await db().automationContact.findUnique({
    where: { id: contactId },
    include: {
      activities: { orderBy: { createdAt: 'desc' }, take: 8 },
      records: { orderBy: { createdAt: 'desc' }, take: 10 },
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
    records: contact.records.map((r) => ({ id: r.id, reference: r.reference, title: r.title, type: r.type, status: r.status, dueDate: r.dueDate })),
    recentActivity: contact.activities.map((a) => ({ type: a.type, content: a.content, at: a.createdAt })),
  };
}

module.exports = {
  STAGES, TASK_KINDS, generateReference, ensureContact, recordMessage, logActivity, updateContact, setStage,
  changeTags, addNote, createRecord, updateRecordStatus, getRecordByReference, getProfile,
};
