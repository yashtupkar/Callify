const { dbService } = require('../../services/DatabaseService');
const crm = require('./crmService');

const str = (description) => ({ type: 'string', description });

/** Resolve the CRM contact for the active conversation (creates it on demand). */
async function currentContact(ctx) {
  if (ctx.crmContactId) return ctx.crmContactId;
  const contact = await crm.ensureContact({
    workspaceId: ctx.workspaceId, automationId: ctx.automationId, waId: ctx.contactWaId, name: ctx.contactName,
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
    name: 'crm_create_task',
    category: 'crm',
    description: 'Create a follow-up, callback or appointment request for the business team. Use kind "appointment" for booking requests (it is a request that staff confirm, not a confirmed booking).',
    parameters: {
      type: 'object',
      properties: {
        title: str('What needs to be done'),
        description: str('Extra details such as service, party size or preferences'),
        kind: { type: 'string', enum: crm.TASK_KINDS, description: 'followup, appointment, callback or other' },
        dueAt: str('When it is due or requested, ISO 8601 date-time in the business timezone'),
      },
      required: ['title'],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const task = await crm.createTask({ ...args, workspaceId: ctx.workspaceId, contactId: await currentContact(ctx) });
      return { success: true, taskId: task.id, kind: task.kind, dueAt: task.dueAt, status: 'pending_team_confirmation' };
    },
  },
  {
    name: 'crm_list_tasks',
    category: 'crm',
    description: 'List the open tasks, follow-ups and appointment requests of the current customer.',
    handler: async (_args, ctx) => {
      const tasks = await dbService.prisma.whatsAppCrmTask.findMany({
        where: { contactId: await currentContact(ctx), status: 'open' }, orderBy: { dueAt: 'asc' }, take: 20,
      });
      return { tasks: tasks.map((t) => ({ id: t.id, title: t.title, kind: t.kind, dueAt: t.dueAt })) };
    },
  },
  {
    name: 'crm_complete_task',
    category: 'crm',
    description: 'Mark one of the customer\'s open tasks as done or cancelled-by-resolution. Use the id from crm_list_tasks or crm_get_contact.',
    parameters: { type: 'object', properties: { taskId: str('Task id') }, required: ['taskId'], additionalProperties: false },
    handler: async (args, ctx) => {
      await crm.completeTask(await currentContact(ctx), args.taskId);
      return { success: true };
    },
  },
  {
    name: 'crm_create_deal',
    category: 'crm',
    description: 'Open a deal/opportunity or order for the customer when they show clear purchase intent.',
    parameters: {
      type: 'object',
      properties: { title: str('What is being sold'), value: { type: 'number', description: 'Estimated value' }, currency: str('3-letter currency code, default INR'), notes: str('Deal notes') },
      required: ['title'],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const deal = await crm.createDeal({ ...args, workspaceId: ctx.workspaceId, contactId: await currentContact(ctx) });
      return { success: true, dealId: deal.id };
    },
  },
  {
    name: 'crm_update_deal',
    category: 'crm',
    description: 'Update a deal of the current customer: set status open/won/lost, value or notes. Use the id from crm_get_contact.',
    parameters: {
      type: 'object',
      properties: { dealId: str('Deal id'), status: { type: 'string', enum: ['open', 'won', 'lost'] }, value: { type: 'number' }, notes: str('Deal notes') },
      required: ['dealId'],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const { dealId, ...fields } = args;
      const deal = await crm.updateDeal(await currentContact(ctx), dealId, fields);
      return { success: true, status: deal.status, value: deal.value };
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
    name: 'request_human_handoff',
    category: 'general',
    description: 'Transfer the conversation to a human team member when the customer asks for a person, is upset, or the request is outside what you can do. After calling it, tell the customer a team member will reach out.',
    parameters: { type: 'object', properties: { reason: str('Why a human is needed') }, required: ['reason'], additionalProperties: false },
    handler: async (args, ctx) => {
      const contactId = await currentContact(ctx);
      await crm.logActivity(contactId, 'handoff', `Handed off to human: ${args.reason}`, null, 'ai');
      await crm.createTask({ workspaceId: ctx.workspaceId, contactId, title: 'Customer needs human assistance', description: args.reason, kind: 'callback' });
      if (ctx.onHandoff) await ctx.onHandoff(args.reason);
      return { success: true, message: 'Conversation transferred. Tell the customer a team member will contact them shortly.' };
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
