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

/**
 * Categorize record type or tool title into normalized request categories.
 * e.g., 'book_site_survey' -> 'booking', 'register_complaint' -> 'complaint'
 */
function categorizeRecordType(typeOrTitle = '') {
  const s = String(typeOrTitle || '').toLowerCase();
  if (/(book|appoint|survey|visit|schedul|slot|demo|reserv)/i.test(s)) {
    return 'booking';
  }
  if (/(complaint|issue|griev|problem|ticket|dispute)/i.test(s)) {
    return 'complaint';
  }
  if (/(callback|call_back|call_request)/i.test(s)) {
    return 'callback';
  }
  if (/(lead|quote|inquiry|enquiry)/i.test(s)) {
    return 'lead';
  }
  return s.replace(/[^a-z0-9]+/g, '_').slice(0, 30) || 'other';
}

/**
 * Determine if a record is "more old" (overdue past its scheduled dueDate, or created > 24 hours ago).
 */
function isRecordOld(record, thresholdHours = Number(process.env.CRM_OLD_RECORD_HOURS || 24)) {
  if (!record) return false;
  const now = Date.now();
  if (record.dueDate) {
    const dueTime = new Date(record.dueDate).getTime();
    if (!Number.isNaN(dueTime)) {
      // If dueDate is in the past, it is overdue / old
      if (dueTime < now) return true;
      // If dueDate is in the future, it is an upcoming active booking (NOT old)
      return false;
    }
  }
  const createdTime = new Date(record.createdAt).getTime();
  if (Number.isNaN(createdTime)) return false;
  const ageMs = now - createdTime;
  return ageMs >= thresholdHours * 60 * 60 * 1000;
}

/**
 * Format a record timestamp human-readably in the business timezone.
 */
function formatRecordDate(date, timezone = 'Asia/Kolkata') {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return String(date);
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'Asia/Kolkata',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Check if the customer has explicitly confirmed they want to rebook / book again or submit a new request.
 */
function hasUserConfirmedRebook(transcript = []) {
  if (!Array.isArray(transcript) || transcript.length === 0) return false;
  const userMsgs = transcript.filter((m) => m.role === 'user' && typeof m.content === 'string');
  if (!userMsgs.length) return false;

  const lastUserMsg = userMsgs[userMsgs.length - 1].content.toLowerCase().trim();
  const explicitRebookRegex = /\b(book again|rebook|re-book|new booking|new complaint|new request|file again|register again|again|another one|another booking|another complaint|fresh booking|fresh complaint)\b/i;
  if (explicitRebookRegex.test(lastUserMsg)) {
    return true;
  }

  // If assistant previously offered option to book again / re-file
  const assistantMsgs = transcript.filter((m) => m.role === 'assistant' && typeof m.content === 'string');
  const lastAssistantMsg = assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1].content.toLowerCase() : '';
  const assistantOfferedRebook = /\b(book again|option to book|rebook|submit a new|create a new|file again|new one)\b/i.test(lastAssistantMsg);
  if (assistantOfferedRebook) {
    const affirmativeRegex = /\b(yes|yep|yeah|sure|ok|okay|please|proceed|go ahead|do it|confirm)\b/i;
    if (affirmativeRegex.test(lastUserMsg) && !/\b(no|don't|dont|cancel|nevermind)\b/i.test(lastUserMsg)) {
      return true;
    }
  }

  return false;
}

/**
 * Get all open records for a contact by waId in an automation.
 */
async function getOpenRecordsForWaId(automationId, waId) {
  if (!automationId || !waId) return [];
  try {
    const contact = await db().automationContact.findUnique({
      where: { automationId_waId: { automationId, waId: String(waId) } },
      select: { id: true },
    });
    if (!contact) return [];
    return await db().automationRecord.findMany({
      where: { automationId, contactId: contact.id, status: 'open' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  } catch (err) {
    return [];
  }
}

/**
 * Find an active open record matching category or type for a contact.
 */
async function findActiveOpenRecord({ automationId, contactId, contactWaId, type, title }) {
  if (!automationId) return null;
  let cId = contactId;
  if (!cId && contactWaId) {
    try {
      const contact = await db().automationContact.findUnique({
        where: { automationId_waId: { automationId, waId: String(contactWaId) } },
        select: { id: true },
      });
      cId = contact?.id;
    } catch (_) {}
  }
  if (!cId) return null;

  try {
    const targetCategory = categorizeRecordType(type || title);
    const records = await db().automationRecord.findMany({
      where: { automationId, contactId: cId, status: 'open' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    for (const rec of records) {
      const recCategory = categorizeRecordType(rec.type || rec.title);
      if (recCategory === targetCategory || (type && rec.type === type)) {
        return rec;
      }
    }
  } catch (err) {
    console.warn('[CRMService] findActiveOpenRecord failed:', err.message);
  }
  return null;
}

/**
 * Format open records into prompt instructions for the LLM.
 */
function formatOpenRecordsPrompt(openRecords = [], timezone = 'Asia/Kolkata') {
  if (!Array.isArray(openRecords) || openRecords.length === 0) return '';
  const lines = openRecords.map((r, i) => {
    const isOld = isRecordOld(r);
    const cat = categorizeRecordType(r.type || r.title);
    const dateStr = formatRecordDate(r.createdAt, timezone);
    const dueStr = r.dueDate ? ` (Due/Scheduled: ${formatRecordDate(r.dueDate, timezone)})` : '';
    const statusNote = isOld
      ? 'OLDER REQUEST: Customer may be given the option to re-book / submit again'
      : 'RECENT ACTIVE REQUEST: Team will reach out; do not create duplicate';
    return `- [Record ${i + 1}] Ref: ${r.reference} | Type: ${r.type} (${cat}) | Title: "${r.title}" | Created: ${dateStr}${dueStr} | Status: ${statusNote}`;
  }).join('\n');

  return `CUSTOMER OPEN RECORDS CONTEXT:
The customer currently has the following OPEN records on file:
${lines}

CRITICAL RULES FOR BOOKINGS & COMPLAINTS:
1. If the customer asks to make a booking, appointment, or file a complaint:
   - If they have a RECENT open record of the same kind:
     DO NOT start collecting details or book again. Give reply that they already have an open booking/complaint and the team will reach out to them:
     "You already have an open booking [or complaint] (Reference: <ref>). Our team is working on it and will reach out to you shortly."
   - If their open booking/complaint is MORE OLD:
     Inform them that they have an open booking/complaint from <date> (Reference: <ref>), and give them the option to book again or follow up on the existing one:
     "You have an open booking [or complaint] from <date> (Reference: <ref>). Since it has been a while, would you like to book again or follow up on your existing request?"
     Only proceed with booking if the customer explicitly says they want to book again.`;
}

module.exports = {
  STAGES, TASK_KINDS, generateReference, ensureContact, recordMessage, logActivity, updateContact, setStage,
  changeTags, addNote, createRecord, updateRecordStatus, getRecordByReference, getProfile,
  categorizeRecordType, isRecordOld, formatRecordDate, hasUserConfirmedRebook,
  getOpenRecordsForWaId, findActiveOpenRecord, formatOpenRecordsPrompt,
};
