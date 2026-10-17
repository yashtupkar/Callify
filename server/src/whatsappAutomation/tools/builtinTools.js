const { dbService } = require('../../services/DatabaseService');
const crm = require('./crmService');

const str = (description) => ({ type: 'string', description });

/** Resolve the CRM contact for the active conversation (creates it on demand). */
async function currentContact(ctx) {
  if (ctx.crmContactId) return ctx.crmContactId;
  const contact = await crm.ensureContact({
    automationId: ctx.automationId, waId: ctx.contactWaId, name: ctx.contactName,
  });
  if (!contact) throw new Error('CRM contact is unavailable for this conversation');
  ctx.crmContactId = contact.id;
  return contact.id;
}

function localTimeParts(timezone) {
  const now = new Date();
  const tz = timezone || 'Asia/Kolkata';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
    const get = (type) => parts.find((p) => p.type === type)?.value;
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    return { now, tz, day, hhmm: `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}` };
  } catch {
    return { now, tz: 'UTC', day: now.getUTCDay(), hhmm: now.toISOString().slice(11, 16) };
  }
}

const contactTools = [
  {
    name: 'crm_get_contact',
    category: 'crm',
    description: 'Get the CRM profile of the current customer: saved details, stage, tags, open tasks, deals and recent activity. Use it to recall what is already known before asking the customer again.',
    handler: async (_args, ctx) => crm.getProfile(await currentContact(ctx)),
  },
  {
    name: 'crm_update_contact',
    category: 'crm',
    description: 'Save details the customer has shared (name, email, company, city, or any other field in customFields such as budget or requirement). Only save values the customer actually stated.',
    parameters: {
      type: 'object',
      properties: {
        name: str('Customer full name'),
        email: str('Customer email address'),
        company: str('Company or organisation'),
        city: str('City or location'),
        customFields: { type: 'object', description: 'Any other facts as key/value pairs, e.g. {"budget":"50000","interest":"2BHK"}', additionalProperties: true },
      },
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const contact = await crm.updateContact(await currentContact(ctx), args);
      return { success: true, name: contact.name, email: contact.email, company: contact.company, city: contact.city, customFields: contact.customFields || {} };
    },
  },
  {
    name: 'crm_set_stage',
    category: 'crm',
    description: 'Move the customer to a sales stage as the conversation progresses: new, contacted, qualified (genuine interest/budget), proposal (quote or options shared), won (confirmed purchase/booking), lost (declined or not interested).',
    parameters: {
      type: 'object',
      properties: { stage: { type: 'string', enum: crm.STAGES, description: 'The new stage' }, reason: str('Short reason for the change') },
      required: ['stage'],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const contact = await crm.setStage(await currentContact(ctx), args.stage, args.reason);
      return { success: true, stage: contact.stage };
    },
  },
  {
    name: 'crm_update_tags',
    category: 'crm',
    description: 'Add or remove short labels on the customer (e.g. "vip", "interested-in-demo", "price-sensitive").',
    parameters: {
      type: 'object',
      properties: {
        add: { type: 'array', items: { type: 'string' }, description: 'Tags to add' },
        remove: { type: 'array', items: { type: 'string' }, description: 'Tags to remove' },
      },
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const contact = await crm.changeTags(await currentContact(ctx), args);
      return { success: true, tags: contact.tags };
    },
  },
  {
    name: 'crm_add_note',
    category: 'crm',
    description: 'Record an internal note on the customer timeline for the business team (requirements, objections, preferences, summary of the chat). Never shown to the customer.',
    parameters: { type: 'object', properties: { note: str('The note text') }, required: ['note'], additionalProperties: false },
    handler: async (args, ctx) => {
      await crm.addNote(await currentContact(ctx), args.note);
      return { success: true };
    },
  },
  {
    name: 'crm_create_record',
    category: 'crm',
    description: 'Create a new record (like a lead, booking, or complaint) for the customer. MUST ONLY be called AFTER the customer has explicitly confirmed the summarized details in the chat.',
    parameters: {
      type: 'object',
      properties: {
        title: str('Short title for the record'),
        type: str('The type of record (e.g. "booking", "lead", "complaint")'),
        fields: { type: 'object', description: 'Any collected details as JSON' },
        dueDate: str('When it is due, ISO 8601 date-time'),
        rebook: { type: 'boolean', description: 'Set to true if customer has an older open record and explicitly confirmed they want to book again or submit a new request' },
      },
      required: ['title', 'type'],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      // Backend confirmation enforcement
      if (ctx && typeof ctx.getRecentTranscript === 'function') {
        const transcript = ctx.getRecentTranscript() || [];
        if (transcript.length > 0) {
          const userMsgs = transcript.filter(m => m.role === 'user' && typeof m.content === 'string');
          const lastUserMsg = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content.toLowerCase() : '';
          const confirmWords = ['yes', 'yep', 'yeah', 'sure', 'ok', 'okay', 'correct', 'confirm', 'proceed', 'go ahead', 'do it', 'please', 'fine', 'looks good', 'right', 'agree'];
          const userConfirmedInMsg = confirmWords.some(w => new RegExp(`\\b${w}\\b`, 'i').test(lastUserMsg)) || lastUserMsg.includes('confirm');
          const isExplicitChangeMsg = /\b(change|instead|actually|update|make it|reschedule|wrong|no)\b/i.test(lastUserMsg);

          if (!userConfirmedInMsg || isExplicitChangeMsg) {
            return {
              success: false,
              error: 'NEED_USER_CONFIRMATION',
              message: `Error: You must present a clear summary of this ${args.type || 'request'} to the customer and receive their explicit confirmation before creating the record.`
            };
          }
        }
      }

      // Check for existing open records of the same type/category
      try {
        const contactId = await currentContact(ctx);
        const openRecord = await crm.findActiveOpenRecord({
          automationId: ctx.automationId,
          contactId,
          contactWaId: ctx.contactWaId,
          type: args.type,
          title: args.title,
        });

        if (openRecord) {
          const isOld = crm.isRecordOld(openRecord);
          if (!isOld) {
            return {
              success: false,
              error: 'EXISTING_OPEN_RECORD',
              hasOpenRecord: true,
              isOld: false,
              reference: openRecord.reference,
              type: openRecord.type,
              title: openRecord.title,
              createdAt: openRecord.createdAt,
              dueDate: openRecord.dueDate,
              message: `You already have an open ${openRecord.type || 'request'} (Reference: ${openRecord.reference}, "${openRecord.title}"). Our team is actively working on it and will reach out to you shortly.`,
            };
          }

          const hasConfirmedRebook = args.rebook === true || crm.hasUserConfirmedRebook(ctx?.getRecentTranscript?.() || []);
          if (!hasConfirmedRebook) {
            const dateStr = crm.formatRecordDate(openRecord.createdAt, ctx.timezone);
            return {
              success: false,
              error: 'EXISTING_OLD_RECORD',
              hasOpenRecord: true,
              isOld: true,
              reference: openRecord.reference,
              type: openRecord.type,
              title: openRecord.title,
              createdAt: openRecord.createdAt,
              dueDate: openRecord.dueDate,
              message: `The customer has an existing open ${openRecord.type || 'request'} from ${dateStr} (Reference: ${openRecord.reference}). Ask the customer if they would like to book again / submit a new request or follow up on their existing one.`,
            };
          }
        }
      } catch (err) {
        console.warn('[crm_create_record] Error checking active open record:', err.message);
      }

      const record = await crm.createRecord({ ...args, automationId: ctx.automationId, contactId: await currentContact(ctx) });
      return { success: true, reference: record.reference, type: record.type, status: record.status };
    },
  },
  {
    name: 'crm_list_records',
    category: 'crm',
    description: 'List the open records (bookings, requests, etc.) of the current customer.',
    handler: async (_args, ctx) => {
      const records = await dbService.prisma.automationRecord.findMany({
        where: { contactId: await currentContact(ctx), status: 'open' }, orderBy: { createdAt: 'desc' }, take: 20,
      });
      return { records: records.map((r) => ({ reference: r.reference, title: r.title, type: r.type, status: r.status })) };
    },
  },
  {
    name: 'crm_change_record_status',
    category: 'crm',
    description: 'Change the status of an existing record (e.g., to "done" or "cancelled"). MUST ONLY be called AFTER the customer explicitly requests or confirms the status change.',
    parameters: { type: 'object', properties: { reference: str('Record reference code'), status: str('New status (e.g. done, open, cancelled)') }, required: ['reference', 'status'], additionalProperties: false },
    handler: async (args, ctx) => {
      if (ctx && typeof ctx.getRecentTranscript === 'function') {
        const transcript = ctx.getRecentTranscript() || [];
        if (transcript.length > 0) {
          const userMsgs = transcript.filter(m => m.role === 'user' && typeof m.content === 'string');
          const lastUserMsg = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content.toLowerCase() : '';
          const cancelOrConfirmWords = ['cancel', 'close', 'done', 'yes', 'confirm', 'proceed', 'sure', 'ok'];
          const userApproved = cancelOrConfirmWords.some(w => new RegExp(`\\b${w}\\b`, 'i').test(lastUserMsg));
          if (!userApproved) {
            return {
              success: false,
              error: 'NEED_USER_CONFIRMATION',
              message: `Error: Ask the customer to confirm changing record ${args.reference} status to "${args.status}" before updating it.`
            };
          }
        }
      }

      await crm.updateRecordStatus(await currentContact(ctx), args.reference, args.status);
      return { success: true };
    },
  },
];

const generalTools = [
  {
    name: 'get_current_datetime',
    category: 'general',
    description: 'Get the current date, time and weekday in the business timezone. Use it to resolve "today", "tomorrow", "next Monday".',
    handler: async (_args, ctx) => {
      const { now, tz, day } = localTimeParts(ctx.timezone);
      const local = new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' }).format(now);
      return { iso: now.toISOString(), timezone: tz, local, dayOfWeek: day };
    },
  },
  {
    name: 'get_business_hours',
    category: 'general',
    description: 'Get the business opening hours and whether the business is open right now.',
    handler: async (_args, ctx) => {
      const rows = await dbService.prisma.whatsAppBusinessHour.findMany({ where: { automationId: ctx.automationId }, orderBy: { dayOfWeek: 'asc' } });
      if (!rows.length) return { configured: false, message: 'Business hours are not configured' };
      const { day, hhmm, tz } = localTimeParts(ctx.timezone);
      const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const today = rows.find((r) => r.dayOfWeek === day);
      const openNow = Boolean(today?.enabled && today.openTime && today.closeTime && hhmm >= today.openTime && hhmm <= today.closeTime);
      return {
        configured: true, timezone: tz, openNow,
        hours: rows.map((r) => ({ day: names[r.dayOfWeek], open: r.enabled ? `${r.openTime}-${r.closeTime}` : 'closed' })),
      };
    },
  },
  {
    name: 'search_products',
    category: 'general',
    description: 'Search the business catalogue (products/services with prices) by keyword. Call with no query to list items.',
    parameters: { type: 'object', properties: { query: str('Keyword to search for') }, additionalProperties: false },
    handler: async (args, ctx) => {
      const q = String(args.query || '').trim();
      const rows = await dbService.prisma.whatsAppProduct.findMany({
        where: {
          automationId: ctx.automationId, enabled: true,
          ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { category: { contains: q, mode: 'insensitive' } }] } : {}),
        },
        take: 10,
      });
      return { products: rows.map((p) => ({ name: p.name, description: p.description, category: p.category, price: p.price, imageUrl: p.imageUrl })) };
    },
  },
  {
    name: 'search_faq',
    category: 'general',
    description: 'Search the business FAQ for an answer to a customer question. Use before saying you do not know.',
    parameters: { type: 'object', properties: { query: str('The customer question or keywords') }, required: ['query'], additionalProperties: false },
    handler: async (args, ctx) => {
      const words = String(args.query).toLowerCase().split(/\W+/).filter((w) => w.length > 2);
      const faqs = await dbService.prisma.whatsAppFaq.findMany({ where: { automationId: ctx.automationId, enabled: true }, orderBy: { priority: 'asc' }, take: 200 });
      const scored = faqs.map((faq) => {
        const hay = `${faq.question} ${faq.keywords.join(' ')}`.toLowerCase();
        return { faq, score: words.filter((w) => hay.includes(w)).length };
      }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
      return { matches: scored.map(({ faq }) => ({ question: faq.question, answer: faq.answer })) };
    },
  },
  {
    name: 'check_request_status',
    category: 'general',
    description: 'Check the status of any request, booking, complaint or service using its reference code (e.g. "BOO-JK6T9"). Use this when the customer asks "what is the status of my request / booking / complaint?" and provides a reference code. Never guess a status — always call this tool.',
    parameters: {
      type: 'object',
      properties: { reference: str('The reference code provided by the customer, e.g. "BOO-JK6T9"') },
      required: ['reference'],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const record = await crm.getRecordByReference(args.reference, ctx.automationId);
      if (!record) {
        return {
          found: false,
          message: `No request found with reference "${args.reference}". Please check the code and try again, or contact our team for help.`,
        };
      }
      const statusLabel = { open: 'Pending — our team is working on it', done: 'Completed', cancelled: 'Cancelled' }[record.status] || record.status;
      return {
        found: true,
        reference: record.reference,
        type: record.type,
        title: record.title,
        status: record.status,
        statusLabel,
        dueDate: record.dueDate,
        submittedAt: record.createdAt,
      };
    },
  },
  {
    name: 'check_my_requests',
    category: 'general',
    description: 'List all open requests, bookings, complaints or follow-ups registered for the current customer in this conversation. Use when the customer asks "what requests do I have?" or "show me my bookings" without providing a specific reference code.',
    handler: async (_args, ctx) => {
      const records = await dbService.prisma.automationRecord.findMany({
        where: { contactId: await currentContact(ctx), status: 'open' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { reference: true, title: true, type: true, status: true, dueDate: true, createdAt: true },
      });
      if (!records.length) {
        return { found: false, message: 'No open requests found for your account.' };
      }
      return {
        found: true,
        requests: records.map((r) => ({
          reference: r.reference || '(legacy — no reference)',
          type: r.type,
          title: r.title,
          status: r.status,
          dueDate: r.dueDate,
          submittedAt: r.createdAt,
          isOld: crm.isRecordOld(r),
        })),
      };
    },
  },
  {
    name: 'request_human_handoff',
    category: 'general',
    description: 'Transfer the conversation to a human team member when the customer asks for a person, is upset, or the request is outside what you can do. After calling it, tell the customer a team member will reach out.',
    parameters: { type: 'object', properties: { reason: str('Why a human is needed') }, required: ['reason'], additionalProperties: false },
    handler: async (args, ctx) => {
      const contactId = await currentContact(ctx);
      await crm.logActivity(ctx.automationId, contactId, null, 'handoff', `Handed off to human: ${args.reason}`, null, 'ai');
      await crm.createRecord({ automationId: ctx.automationId, contactId, title: 'Customer needs human assistance', fields: { reason: args.reason }, type: 'callback' });
      if (ctx.onHandoff) await ctx.onHandoff(args.reason);
      return { success: true, message: '👥 *Connecting with Our Team*\n\nOur team has been notified and will connect with you in a short time. Please keep patience as our representatives will reach out as soon as they are available. 🙏\n\n_(Reply *BOT* or *MENU* at any time to resume automated assistance.)_' };
    },
  },
];

const BUILT_IN_TOOLS = [...contactTools, ...generalTools];

function registerBuiltInTools(registry, { disabled = new Set() } = {}) {
  for (const tool of BUILT_IN_TOOLS) {
    if (!disabled.has(tool.name)) registry.register(tool);
  }
  return registry;
}

module.exports = { BUILT_IN_TOOLS, registerBuiltInTools };
