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

  properties.rebook = {
    type: 'boolean',
    description: 'Set to true if the customer has an older open request and explicitly confirmed they want to book again or create a fresh request.'
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
          // Identify the boundary of the CURRENT request.
          // A boundary marks the end of a SUCCESSFULLY COMPLETED transaction.
          // Only these count as boundaries:
          //   • A tool result with success:true and a reference (record saved)
          //   • An assistant message confirming a booking (contains a reference code)
          // FAILED tool calls (NOT_CONFIRMED, MISSING_REQUIRED_FIELDS, etc.) are NOT
          // boundaries — they are part of the ongoing request flow.
          let lastBoundaryIdx = -1;
          for (let i = transcript.length - 1; i >= 0; i--) {
            const m = transcript[i];
            if (m.role === 'tool') {
              try {
                const toolResult = typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
                if (toolResult?.success === true && toolResult?.reference) {
                  lastBoundaryIdx = i;
                  break;
                }
              } catch (_) { /* non-JSON tool result, not a boundary */ }
              // Failed or informational tool results — keep scanning backward
              continue;
            }
            if (m.role === 'assistant' && /Booked [A-Z0-9-]+|recorded with Reference|Reference:\s*[A-Z0-9-]+/i.test(m.content || '')) {
              lastBoundaryIdx = i;
              break;
            }
          }

          // Active request messages (only what was sent AFTER the last completed transaction, or full conversation if first)
          const currentScopeMsgs = lastBoundaryIdx >= 0 ? transcript.slice(lastBoundaryIdx + 1) : transcript;
          const userMsgs = currentScopeMsgs.filter(m => m.role === 'user' && typeof m.content === 'string');
          const currentUserText = userMsgs.map(m => m.content).join(' ').toLowerCase();

          // Check if transaction-specific fields (e.g. address, location, problem description, time) were given in THIS request
          const unprovided = [];
          for (const field of config.fields) {
            if (field.required !== false && args[field.key]) {
              const valStr = String(args[field.key]).toLowerCase().trim();
              if (valStr.length > 1) {
                const isName = field.key.includes('name') || field.label.toLowerCase().includes('name');
                const isAddress = field.key.includes('address') || field.label.toLowerCase().includes('address') || field.key.includes('location');

                if (isName) {
                  // Profile data: Customer name CAN be reused across requests from profile or earlier messages
                  const matchesProfile = (ctx.contactName && ctx.contactName.toLowerCase().includes(valStr)) || (ctx.contactWaId && ctx.contactWaId.includes(valStr));
                  const fullHistoryUserText = transcript.filter(m => m.role === 'user' && typeof m.content === 'string').map(m => m.content).join(' ').toLowerCase();
                  const matchesText = currentUserText.includes(valStr) || fullHistoryUserText.includes(valStr) || valStr.split(' ').some(w => w.length > 2 && fullHistoryUserText.includes(w));
                  if (!matchesProfile && !matchesText) {
                    unprovided.push(field.label || field.key);
                  }
                } else if (isAddress) {
                  // Transaction data: Must be provided in the CURRENT request scope!
                  const addressWords = valStr.split(/[\s,.-]+/).filter(w => w.length > 2);
                  const matchesCurrent = currentUserText.includes(valStr) || addressWords.some(w => currentUserText.includes(w));
                  if (!matchesCurrent) {
                    unprovided.push(field.label || field.key);
                  }
                } else {
                  // Any other custom field (notes, complaint description, requirement, etc.): Must be in CURRENT request scope!
                  const words = valStr.split(/[\s,.-]+/).filter(w => w.length > 2);
                  const matchesCurrent = currentUserText.includes(valStr) || (words.length > 0 && words.some(w => currentUserText.includes(w)));
                  if (!matchesCurrent) {
                    unprovided.push(field.label || field.key);
                  }
                }
              }
            }
          }

          // Check if date/time ("when") was mentioned in the CURRENT request scope when askWhen is enabled
          if (config.askWhen && args.when) {
            const timeWords = ['today', 'tomorrow', 'yesterday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'am', 'pm', 'morning', 'afternoon', 'evening', 'night', 'oclock', 'clock', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
            const hasTimeWord = timeWords.some(w => currentUserText.includes(w)) || /\b\d{1,4}[/-:]\d{1,4}\b/.test(currentUserText) || /\b\d{1,2}\s*(am|pm)?\b/.test(currentUserText);
            if (!hasTimeWord) {
              unprovided.push('Date & Time');
            }
          }

          if (unprovided.length > 0) {
            return {
              success: false,
              error: 'UNPROVIDED_CUSTOMER_DETAILS',
              message: `Error: The customer has NOT provided fresh detail(s) for this new request: [${unprovided.join(', ')}]. DO NOT reuse details from previous requests. Send a text message asking the customer to provide their ${unprovided.join(', ')} for this request.`
            };
          }

          // Check confirmation ONLY within the current request scope
          const assistantMsgs = currentScopeMsgs.filter(m => m.role === 'assistant' && typeof m.content === 'string' && m.content.trim().length > 0);
          const lastUserMsg = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content.toLowerCase() : '';
          const hasAskedConfirmation = assistantMsgs.some(m => {
            const text = m.content.toLowerCase();
            return text.includes('confirm') || text.includes('summary') || text.includes('is this correct') || text.includes('would you like me to') || text.includes('shall i proceed') || text.includes('proceed with');
          });

          const confirmWords = ['yes', 'yep', 'yeah', 'sure', 'ok', 'okay', 'correct', 'confirm', 'proceed', 'go ahead', 'do it', 'please', 'fine', 'looks good', 'right', 'agree'];
          const userConfirmedInMsg = confirmWords.some(w => new RegExp(`\\b${w}\\b`, 'i').test(lastUserMsg)) || lastUserMsg.includes('confirm');

          // If the customer changed details in their last message (not a simple confirmation word), any previous confirmation is invalidated
          const isExplicitChangeMsg = /\b(change|instead|actually|update|make it|reschedule|wrong|no)\b/i.test(lastUserMsg);

          if (!hasAskedConfirmation || !userConfirmedInMsg || isExplicitChangeMsg) {
            return {
              success: false,
              error: 'NEED_USER_CONFIRMATION',
              message: `Error: You have not presented a fresh summary of the details to the customer or received their explicit confirmation for this request yet. Send a text message summarizing the current details (${config.fields.map(f => f.label).join(', ')}) and ask for their confirmation before calling this tool.`
            };
          }
        }
      }

      // 3.5 Check for existing open records of the same type/category
      const autoId = ctx?.automationId || ctx?.workspaceId;
      if (autoId && (ctx?.contactWaId || ctx?.crmContactId)) {
        try {
          const openRecord = await crm.findActiveOpenRecord({
            automationId: autoId,
            contactWaId: ctx.contactWaId,
            contactId: ctx.crmContactId,
            type: config.name,
            title: config.title,
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
                message: `You already have an open ${config.title || 'booking/request'} (Reference: ${openRecord.reference}). Our team is working on it and will reach out to you shortly. You do not need to submit another one.`,
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
                message: `The customer has an existing open ${config.title || 'request'} from ${dateStr} (Reference: ${openRecord.reference}). Ask the customer if they would like to book again / submit a new request or follow up on their previous request.`,
              };
            }
          }
        } catch (openErr) {
          console.warn('[CustomTool] Error checking active open record:', openErr.message);
        }
      }

      // 4. Perform CRM writes if context has workspaceId and contactWaId
      const contactData = {};
      for (const field of config.fields) {
        if (CONTACT_KEYS.has(field.key) && args[field.key]) {
          contactData[field.key] = String(args[field.key]).trim();
        }
      }

      let contactId = null;
      let createdRecord = null;
      if (autoId && ctx?.contactWaId) {
        contactId = await crm.ensureContact({
          automationId: autoId,
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
          
          const fieldsData = {};
          for (const field of config.fields) {
            if (args[field.key]) fieldsData[field.key] = args[field.key];
          }

          try {
            if (typeof crm.createTask === 'function') {
              const taskRes = await crm.createTask({
                automationId: autoId,
                contactId,
                kind: config.name,
                title: `${config.title}`,
                dueAt: args.when || null,
              });
              if (taskRes) createdRecord = taskRes;
            }
            if (typeof crm.createRecord === 'function') {
              try {
                const rec = await crm.createRecord({
                  automationId: autoId,
                  contactId,
                  type: config.name,
                  title: `${config.title}`,
                  fields: fieldsData,
                  dueDate: args.when || null,
                });
                if (rec) createdRecord = rec;
              } catch (dbErr) {
                if (!createdRecord) throw dbErr;
              }
            }
            if (createdRecord?.reference) {
              await crm.addNote(contactId, `Custom tool "${config.title}" recorded with Reference: ${createdRecord.reference}`).catch(() => {});
            }
          } catch (createErr) {
            console.error('[CustomTool] record creation failed:', createErr.message);
            return {
              success: false,
              error: 'DATABASE_WRITE_FAILED',
              message: 'Sorry, your request could not be saved at this time. Please try again or ask our team for assistance.',
            };
          }
        }
      }

      const activeRef = createdRecord?.reference || crm.generateReference(slug(config.name, 3));
      const defaultReply = `✅ *${config.title} Confirmed!*\n\n🏷️ *Reference ID:* ${activeRef}\n\n💬 Our team has received your details and will follow up in a short time. Thank you! 🙏`;
      const replyTemplate = config.replyMessage || defaultReply;
      return {
        success: true,
        reference: activeRef,
        message: replyTemplate.replace(/\{\{\s*ref\s*\}\}/gi, activeRef),
      };
    },
  };
}

module.exports = { buildCustomTool, normalizeCustomConfig };
