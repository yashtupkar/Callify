const crm = require('./crmService');

const slug = (value, max = 40) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max);
const CONTACT_KEYS = new Set(['name', 'email', 'company', 'city']);

/**
 * Normalise the simple form a user fills in:
 * { name, description, fields:[{label, required}], askWhen, stage, replyMessage }
 * Returns null when the definition is unusable.
 */
function normalizeCustomConfig(input = {}) {
  const name = slug(input.name, 50);
  if (!name) return null;
  const seen = new Set();
  const fields = (Array.isArray(input.fields) ? input.fields : [])
    .map((field) => {
      const label = String(typeof field === 'string' ? field : field?.label || '').trim().slice(0, 60);
      return { label, key: slug(label, 30), required: typeof field === 'object' ? field.required !== false : true };
    })
    .filter((field) => field.key && !seen.has(field.key) && seen.add(field.key))
    .slice(0, 12);
  return {
    type: 'custom',
    name,
    title: String(input.title || name.replace(/_/g, ' ')).trim().slice(0, 80),
    description: String(input.description || '').trim().slice(0, 500),
    fields,
    askWhen: Boolean(input.askWhen),
    stage: crm.STAGES.includes(input.stage) ? input.stage : '',
    replyMessage: String(input.replyMessage || '').trim().slice(0, 300),
  };
}

/** Turn a custom-tool config into a registry tool definition. */
function buildCustomTool(rawConfig) {
  const config = normalizeCustomConfig(rawConfig);
  if (!config) return null;
  const properties = {};
  const required = [];
  for (const field of config.fields) {
    properties[field.key] = { type: 'string', description: field.label };
    if (field.required) required.push(field.key);
  }
  if (config.askWhen) {
    properties.when = { type: 'string', description: 'Requested date and time, ISO 8601 in the business timezone' };
    required.push('when');
  }
  
  properties.user_confirmed = {
    type: 'boolean',
    description: 'Set to true ONLY AFTER you have presented a summary of the details to the user and they have explicitly confirmed. You MUST NOT call this tool until the user has confirmed.'
  };

  return {
    name: config.name,
    category: 'custom',
    description: (config.description || `Record a "${config.title}" request for the business team.`) + '\n\nIMPORTANT: Before calling this tool, you MUST explicitly ask the user to provide any missing information. DO NOT guess, assume, or reuse example values for any arguments (like name, phone, or address) unless the customer explicitly provided them in this conversation. Once all details are gathered, present a summary and wait for their explicit confirmation before calling this tool.',
    parameters: { type: 'object', properties, required, additionalProperties: false },
    handler: async (args, ctx) => {
      // 1. Check for missing or empty arguments for all fields
      const missingFields = [];
      for (const field of config.fields) {
        if (field.required !== false) {
          const val = args?.[field.key];
          if (val === undefined || val === null || String(val).trim() === '') {
            missingFields.push(field.label || field.key);
          }
        }
      }
      if (missingFields.length > 0) {
        return {
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: `Error: Missing required detail(s): ${missingFields.join(', ')}. Ask the customer to provide this information before calling this tool.`
        };
      }

      // 2. Reject if explicitly false
      if (args.user_confirmed === false) {
        return {
          success: false,
          error: 'NOT_CONFIRMED',
          message: 'Error: You must ask the user to confirm the details before calling this tool. DO NOT try to call this tool again immediately. You MUST respond to the user with a regular text message summarizing the details and asking for confirmation.'
        };
      }

      // 3. Transcript verification when running in active conversation runtime
      if (ctx && typeof ctx.getRecentTranscript === 'function') {
        const transcript = ctx.getRecentTranscript() || [];
        if (transcript.length > 0) {
          const userMsgs = transcript.filter(m => m.role === 'user' && typeof m.content === 'string');
          const fullUserText = userMsgs.map(m => m.content).join(' ').toLowerCase();

          // Check if key arguments (name, address, date) were actually mentioned by the user or present in profile
          const unprovided = [];
          for (const field of config.fields) {
            if (field.required !== false && args[field.key]) {
              const valStr = String(args[field.key]).toLowerCase().trim();
              if (valStr.length > 1) {
                const isName = field.key.includes('name') || field.label.toLowerCase().includes('name');
                const isAddress = field.key.includes('address') || field.label.toLowerCase().includes('address') || field.key.includes('location');

                if (isName) {
                  const matchesProfile = ctx.contactName && ctx.contactName.toLowerCase().includes(valStr);
                  const matchesText = fullUserText.includes(valStr) || valStr.split(' ').some(w => w.length > 2 && fullUserText.includes(w));
                  if (!matchesProfile && !matchesText) {
                    unprovided.push(field.label || field.key);
                  }
                } else if (isAddress) {
                  const addressWords = valStr.split(/[\s,.-]+/).filter(w => w.length > 2);
                  const matchesText = fullUserText.includes(valStr) || addressWords.some(w => fullUserText.includes(w));
                  if (!matchesText) {
                    unprovided.push(field.label || field.key);
                  }
                }
              }
            }
          }

          // Check if date/time ("when") was mentioned when askWhen is enabled
          if (config.askWhen && args.when) {
            const timeWords = ['today', 'tomorrow', 'yesterday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'am', 'pm', 'morning', 'afternoon', 'evening', 'night', 'oclock', 'clock', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
            const hasTimeWord = timeWords.some(w => fullUserText.includes(w)) || /\b\d{1,4}[/-:]\d{1,4}\b/.test(fullUserText) || /\b\d{1,2}\s*(am|pm)?\b/.test(fullUserText);
            if (!hasTimeWord) {
              unprovided.push('Date & Time');
            }
          }

          if (unprovided.length > 0) {
            return {
              success: false,
              error: 'UNPROVIDED_CUSTOMER_DETAILS',
              message: `Error: The customer has NOT provided their detail(s): [${unprovided.join(', ')}] in this conversation yet. DO NOT invent or reuse sample values. Send a text message asking the customer to provide their ${unprovided.join(', ')}.`
            };
          }

          const assistantMsgs = transcript.filter(m => m.role === 'assistant' && typeof m.content === 'string' && m.content.trim().length > 0);
          const lastUserMsg = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content.toLowerCase() : '';
          const hasAskedConfirmation = assistantMsgs.some(m => {
            const text = m.content.toLowerCase();
            return text.includes('confirm') || text.includes('summary') || text.includes('is this correct') || text.includes('would you like me to') || text.includes('shall i proceed') || text.includes('proceed with');
          });

          const confirmWords = ['yes', 'yep', 'yeah', 'sure', 'ok', 'okay', 'correct', 'confirm', 'proceed', 'go ahead', 'do it', 'please', 'fine', 'looks good', 'right', 'agree'];
          const userConfirmedInMsg = confirmWords.some(w => new RegExp(`\\b${w}\\b`, 'i').test(lastUserMsg)) || lastUserMsg.includes('confirm');

          if (!hasAskedConfirmation && !userConfirmedInMsg) {
            return {
              success: false,
              error: 'NEED_USER_CONFIRMATION',
              message: `Error: You have not presented a summary of the details to the customer or received their explicit confirmation yet in this chat. Send a text message to the customer summarizing the details (${config.fields.map(f => f.label).join(', ')}) and ask for their confirmation before calling this tool.`
            };
          }
        }
      }

      // 4. Perform CRM writes if context has workspaceId and contactWaId
      const contactData = {};
      for (const field of config.fields) {
        if (CONTACT_KEYS.has(field.key) && args[field.key]) {
          contactData[field.key] = String(args[field.key]).trim();
        }
      }

      const reference = `${slug(config.name, 3).toUpperCase() || 'REQ'}-${Date.now().toString(36).slice(-5).toUpperCase()}`;

      let contactId = null;
      if (ctx?.workspaceId && ctx?.contactWaId) {
        contactId = await crm.ensureContact({
          workspaceId: ctx.workspaceId,
          automationId: ctx.automationId,
          waId: ctx.contactWaId,
          name: contactData.name || ctx.contactName,
        }).then(c => c?.id).catch(() => null);

        if (contactId) {
          if (Object.keys(contactData).length > 0) {
            await crm.updateContact(contactId, contactData).catch(() => {});
          }
          if (config.stage) {
            await crm.setStage(contactId, config.stage, `Triggered by ${config.title}`).catch(() => {});
          }
          const taskDetails = [`Reference Code: ${reference}`];
          for (const field of config.fields) {
            if (args[field.key]) taskDetails.push(`${field.label}: ${args[field.key]}`);
          }
          await crm.createTask({
            workspaceId: ctx.workspaceId,
            contactId,
            title: `${config.title} (${reference})`,
            description: taskDetails.join('\n'),
            kind: config.name,
            dueAt: args.when || null,
          }).catch(() => {});
          await crm.addNote(contactId, `Custom tool "${config.title}" recorded with Reference: ${reference}`).catch(() => {});
        }
      }

      return {
        success: true,
        reference,
        message: (config.replyMessage || 'Your request has been recorded and our team will follow up.').replace(/\{\{\s*ref\s*\}\}/gi, reference),
      };
    },
  };
}

module.exports = { buildCustomTool, normalizeCustomConfig };
