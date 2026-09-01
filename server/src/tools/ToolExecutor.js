const { executeWebhookTool } = require('./WebhookToolExecutor');
const { dbService } = require('../services/DatabaseService');
const { EmailService } = require('../services/EmailService');
const { WhatsAppService } = require('../services/WhatsAppService');

// Converts an hour/minute integer into a spoken word TTS can read cleanly.
function _numToWord(n) {
  const w = ['zero','one','two','three','four','five','six','seven','eight','nine',
             'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen',
             'seventeen','eighteen','nineteen','twenty'];
  if (n <= 20) return w[n];
  const tens = ['','','twenty','thirty','forty','fifty'];
  const t = Math.floor(n / 10), u = n % 10;
  return u === 0 ? tens[t] : `${tens[t]} ${w[u]}`;
}
function _spokenTime(date) {
  let h = date.getHours();
  const m = date.getMinutes();
  const ampm = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  if (m === 0) return `${_numToWord(h)} ${ampm}`;
  if (m === 30) return `${_numToWord(h)} thirty ${ampm}`;
  return `${_numToWord(h)} ${_numToWord(m)} ${ampm}`;
}
function _slotStr(start, end) { return `${_spokenTime(start)} to ${_spokenTime(end)}`; }

/**
 * ToolExecutor
 *
 * Handles the full lifecycle of a tool call emitted by the LLM:
 *
 *  1. Receives (toolName, args) from the LLM 'tool_call' event.
 *  2. Plays a filler phrase over TTS to mask processing latency (if LLM didn't narrate).
 *  3. Routes to the correct handler:
 *       - end_call            -> ends the conversation after a short delay
 *       - save_collected_data -> saves data to DB, adds transcript entries, re-prompts LLM
 *       - built-in tool       -> executes via ToolRegistry, adds transcript entries, re-prompts LLM
 *       - custom tool         -> appends tool_call to transcript, forwards to frontend via sendToClient
 *
 * ConversationManager wires this up once and delegates the entire
 * tool_call event to: this.toolExecutor.handle(toolName, args)
 */

class ToolExecutor {
  /**
   * @param {object}   opts
   * @param {import('./ToolRegistry').ToolRegistry} opts.registry
   * @param {object}   opts.tts               - TTS provider (feedText / flush)
   * @param {object}   opts.llm               - LLM service (generateResponse)
   * @param {Array}    opts.transcript        - Shared transcript array (mutated in-place)
   * @param {Function} opts.sendToClient      - (msg) => void
   * @param {Function} opts.endConversation   - () => void
   * @param {object}   opts.usageTracker      - UsageTracker instance
   * @param {Function} opts.getRecentTranscript - () => Array
   * @param {Function} opts.getStateManager   - () => CallStateManager
   */
  constructor({ registry, tts, llm, transcript, sendToClient, endConversation, usageTracker, getRecentTranscript, getStateManager }) {
    this.registry        = registry;
    this.tts             = tts;
    this.llm             = llm;
    this.transcript      = transcript;
    this.sendToClient    = sendToClient;
    this.endConversation = endConversation;
    this.usageTracker    = usageTracker;
    this.getRecentTranscript = getRecentTranscript || (() => transcript);
    this.getStateManager = getStateManager || (() => null);
    
    // Guard: prevent save_collected_data from being executed more than once per call
    this._dataSaved      = false;
    this.agentId         = null;
    
    // Idempotency guards to prevent LLM loops
    this._bookingCreated = false;
    this._whatsappSent = false;
    
    // Abort controller for interrupting long-running tools
    this._abortController = null;
    
    // Debounce so two tool calls fired in quick succession within the same
    // turn don't stack two filler utterances on top of each other.
    this._lastFillerAt = 0;
    this.FILLER_DEBOUNCE_MS = 800;
  }
  
  abortCurrentExecution() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  /**
   * Main entry point — called from ConversationManager's tool_call listener.
   *
   * @param {string} toolName
   * @param {object} args
   */
  async handle(toolName, args, preamble, llmToolCallId) {
    console.log(`[ToolExecutor] Tool called: ${toolName}`, args);
    this.usageTracker.incrementToolCall();

    // Send preamble to UI
    if (preamble && preamble.trim()) {
      this.sendToClient({ event: 'transcript', data: { text: preamble.trim(), isFinal: true, speaker: 'agent' } });
    }

    // -------------------------------------------------------------------------
    // SYSTEM: end_call
    // -------------------------------------------------------------------------
    if (toolName === 'end_call') {
      console.log('[ToolExecutor] Queuing end of conversation after TTS finishes.');
      
      let ended = false;
      const doEnd = () => {
        if (ended) return;
        ended = true;
        this.sendToClient({ event: 'stop' });
        this.endConversation();
      };

      // End immediately after final speech, with a 1s grace buffer
      this.tts.once('utterance_complete', () => {
        setTimeout(doEnd, 1000);
      });

      // Fallback: if TTS never fires (e.g. agent ended silently), 
      // force-end after 6 seconds so the call doesn't hang open
      setTimeout(doEnd, 6000);
      return;
    }
    
    this.abortCurrentExecution();
    this._abortController = new AbortController();
    const signal = this._abortController.signal;

    // -------------------------------------------------------------------------
    // SYSTEM: save_collected_data
    // -------------------------------------------------------------------------
    if (toolName === 'save_collected_data') {
      // Guard: ignore duplicate calls within the same conversation
      if (this._dataSaved) {
        console.warn('[ToolExecutor] save_collected_data called again — already saved. Ignoring duplicate.');
        return;
      }

      // Validation: Check for empty strings in provided args
      const emptyFields = Object.keys(args).filter(k => args[k] === undefined || args[k] === null || String(args[k]).trim() === "");
      if (emptyFields.length > 0) {
        console.warn(`[ToolExecutor] Missing required fields in save_collected_data: ${emptyFields.join(', ')}`);
        
        const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);
        
        // Immediately resolve with error so LLM can ask for the missing info
        const result = { 
          success: false, 
          error: `Missing required fields: ${emptyFields.join(', ')}. Do not pass empty strings. Please politely ask the caller for this missing information before calling this tool again.` 
        };
        
        this._appendToolResult(toolName, toolCallId, result);
        const stateManager = this.getStateManager();
        if (stateManager) stateManager.onToolResult(toolName, result);
        
        this._rePromptLLM('auto');
        return;
      }

      this._dataSaved = true;

      console.log('[ToolExecutor] Data successfully collected:', args);
      
      // Play filler to mask latency (REMOVED to prevent filler playback for silent data collection)
      // this._playFiller(toolName, preamble);

      // Save to Native CRM Database
      if (this.agentId) {
        try {
          // Extract known fields (case insensitive), treat empty strings as absent
          const nameKey = Object.keys(args).find(k => k.toLowerCase() === 'name');
          const emailKey = Object.keys(args).find(k => k.toLowerCase() === 'email');
          const phoneKey = Object.keys(args).find(k => k.toLowerCase() === 'phone');
          
          const name = (nameKey && args[nameKey]?.trim()) ? String(args[nameKey]).trim() : null;
          const email = (emailKey && args[emailKey]?.trim()) ? String(args[emailKey]).trim() : null;
          const phone = (phoneKey && args[phoneKey]?.trim()) ? String(args[phoneKey]).trim() : null;

          // Put everything else (non-empty) in metadata
          const metadata = {};
          for (const [k, v] of Object.entries(args)) {
            if (k === nameKey || k === emailKey || k === phoneKey) continue;
            if (v && String(v).trim()) metadata[k] = v;
          }

          // Try to find an existing contact for this agent by phone number (returning callers)
          let contact;
          if (phone) {
            contact = await dbService.prisma.contact.findFirst({
              where: { agentId: this.agentId, phone }
            });
          }

          if (contact) {
            // Returning caller — update their record and reuse their ID
            contact = await dbService.prisma.contact.update({
              where: { id: contact.id },
              data: { name: name || contact.name, email: email || contact.email, metadata }
            });
            console.log('[ToolExecutor] Native CRM: Recognized returning caller, Contact ID', contact.id);
          } else {
            // New caller — create a fresh Contact record
            contact = await dbService.prisma.contact.create({
              data: { agentId: this.agentId, name, email, phone, metadata }
            });
            console.log('[ToolExecutor] Native CRM: Created new Contact ID', contact.id);
          }

          // Save contactId on this class instance for later tools (e.g. booking/cancel)
          this.currentContactId = contact.id;
        } catch (dbErr) {
          console.error('[ToolExecutor] Error saving to Native CRM:', dbErr);
        }
      }

      if (signal.aborted) return;

      // Remove the tool from the registry so the LLM never sees it again
      // and cannot enter a save -> re-prompt -> save loop.
      this.registry.removeDataCollectionTool();

      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);

      // Immediately resolve so the LLM can continue
      this._appendToolResult(toolName, toolCallId, {
        success: true,
        message: "Data saved successfully. You may now proceed with the caller's primary request."
      });

      // Update state manager
      const stateManager = this.getStateManager();
      if (stateManager) stateManager.onToolResult(toolName, { success: true });

      // Re-prompt LLM, requiring it to call the NEXT tool (since we just saved data,
      // it should now call create_booking or whatever the primary action is).
      this._rePromptLLM('required');
      return;
    }

    // -------------------------------------------------------------------------
    // INTERNAL CRM TOOLS
    // -------------------------------------------------------------------------
    if (toolName === 'check_availability') {
      this._playFiller(toolName, preamble);
      let result;
      try {
        if (!this.agentId) throw new Error("Agent ID is missing.");
        const date = new Date(args.date);
        const dayOfWeek = date.getDay(); // 0 (Sun) to 6 (Sat)
        
        const availability = await dbService.prisma.availability.findUnique({
          where: { agentId_dayOfWeek: { agentId: this.agentId, dayOfWeek } },
          include: { agent: true }
        });

        if (!availability || !availability.isActive) {
          result = { available: false, reason: "The agent does not work on this day." };
        } else {
          const slotDuration = availability.agent?.slotDuration || 60;
          
          // Fetch existing bookings for that day
          const startOfDay = new Date(date);
          startOfDay.setHours(0,0,0,0);
          const endOfDay = new Date(date);
          endOfDay.setHours(23,59,59,999);

          const bookings = await dbService.prisma.booking.findMany({
            where: {
              agentId: this.agentId,
              startTime: { gte: startOfDay, lte: endOfDay },
              status: 'confirmed'
            }
          });

          // Generate all slots
          const [startH, startM] = availability.startTime.split(':').map(Number);
          const [endH, endM] = availability.endTime.split(':').map(Number);
          
          let currentSlotTime = new Date(date);
          currentSlotTime.setHours(startH, startM, 0, 0);
          
          const endTimeObj = new Date(date);
          endTimeObj.setHours(endH, endM, 0, 0);

          const availableSlots = [];
          const bookedSlots = [];

          while (currentSlotTime < endTimeObj) {
            const slotStart = new Date(currentSlotTime);
            const slotEnd = new Date(currentSlotTime.getTime() + slotDuration * 60000);
            
            if (slotEnd > endTimeObj) break;
            
            const isOverlap = bookings.some(b => (slotStart < b.endTime && slotEnd > b.startTime));
            
            const slotStr = _slotStr(slotStart, slotEnd);
            if (isOverlap) {
              bookedSlots.push(slotStr);
            } else {
              availableSlots.push(slotStr);
            }
            currentSlotTime = slotEnd;
          }

          result = {
            available: true,
            workingHours: { start: availability.startTime, end: availability.endTime },
            slotDurationMinutes: slotDuration,
            availableSlots,
            bookedSlots,
            existingBookings: bookings.map(b => ({
              start: b.startTime.toISOString(),
              end: b.endTime.toISOString()
            }))
          };

          if (args.time) {
            // Check if the requested time is available
            const [reqH, reqM] = args.time.split(':').map(Number);
            const reqDateStart = new Date(date);
            reqDateStart.setHours(reqH, reqM, 0, 0);
            const reqDateEnd = new Date(reqDateStart.getTime() + slotDuration * 60000);
            
            if (reqDateStart < startOfDay || reqDateEnd > endTimeObj) {
              result.isRequestedTimeAvailable = false;
              result.message = `The requested time ${args.time} is outside working hours (which are ${availability.startTime} to ${availability.endTime}). Please advise the caller to choose a different time on this day or check availability for another day.`;
            } else {
              const isOverlap = bookings.some(b => (reqDateStart < b.endTime && reqDateEnd > b.startTime));
              if (isOverlap) {
                result.isRequestedTimeAvailable = false;
                result.message = `The requested time ${args.time} is already booked. Please pick one of the availableSlots.`;
              } else {
                result.isRequestedTimeAvailable = true;
                result.message = `The requested time ${args.time} is available!`;
              }
            }
          }
        }
      } catch (err) {
        console.error('[ToolExecutor] Error in internal_check_availability:', err);
        result = { error: err.message };
      }
      
      if (signal.aborted) return;
      
      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);
      this._appendToolResult(toolName, toolCallId, result);
      
      const stateManager = this.getStateManager();
      if (stateManager) stateManager.onToolResult(toolName, result);
      
      this._rePromptLLM('auto');
      return;
    }

    if (toolName === 'create_booking') {
      this._playFiller(toolName, preamble);
      let result;
      try {
        if (!this.agentId) throw new Error("Agent ID is missing.");
        if (this._bookingCreated) {
          result = { success: true, message: "Booking was already created successfully in this session. Do not call this tool again. Please proceed to the next step or conclude the call." };
        } else if (!this.currentContactId) {
          result = { success: false, error: "No contact ID found. You must collect and save the user's data using save_collected_data first!" };
        } else {
          const reqStart = new Date(args.startTime);
          const startOfDay = new Date(reqStart);
          startOfDay.setHours(0,0,0,0);
          const endOfDay = new Date(reqStart);
          endOfDay.setHours(23,59,59,999);

          // Check if this contact already has a booking on this day
          const existingBooking = await dbService.prisma.booking.findFirst({
            where: {
              agentId: this.agentId,
              contactId: this.currentContactId,
              startTime: { gte: startOfDay, lte: endOfDay },
              status: 'confirmed'
            }
          });

          if (existingBooking) {
            result = { success: false, error: `This caller already has a confirmed appointment today at ${existingBooking.startTime.toISOString()}. Please inform them and ask if they would like to cancel or reschedule it instead.` };
          } else {
            const booking = await dbService.prisma.booking.create({
              data: {
                agentId: this.agentId,
                contactId: this.currentContactId,
                startTime: reqStart,
                endTime: new Date(args.endTime),
                status: 'confirmed'
              }
            });
            this._bookingCreated = true;
            result = { success: true, bookingId: booking.id, message: "Appointment successfully booked in the internal CRM!" };
          }
        }
      } catch (err) {
        console.error('[ToolExecutor] Error in internal_create_booking:', err);
        result = { error: err.message };
      }

      if (signal.aborted) return;

      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);
      this._appendToolResult(toolName, toolCallId, result);
      
      const stateManager = this.getStateManager();
      if (stateManager) stateManager.onToolResult(toolName, result);

      this._rePromptLLM('auto');
      return;
    }

    if (toolName === 'get_bookings') {
      this._playFiller(toolName, preamble);
      let result;
      try {
        if (!this.agentId) throw new Error('Agent ID is missing.');
        if (!this.currentContactId) {
          result = { success: false, error: "I don't have your details on file yet. Could you please share your name and phone number first?" };
        } else {
          const bookings = await dbService.prisma.booking.findMany({
            where: {
              agentId: this.agentId,
              contactId: this.currentContactId,
              status: 'confirmed'
            },
            orderBy: { startTime: 'asc' }
          });
          if (bookings.length === 0) {
            result = { success: true, message: 'No upcoming confirmed bookings found for this caller.', bookings: [] };
          } else {
            result = {
              success: true,
              bookings: bookings.map(b => ({
                bookingId: b.id,
                startTime: b.startTime.toISOString(),
                endTime: b.endTime.toISOString(),
                status: b.status
              }))
            };
          }
        }
      } catch (err) {
        console.error('[ToolExecutor] Error in internal_get_bookings:', err);
        result = { error: err.message };
      }
      
      if (signal.aborted) return;
      
      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);
      this._appendToolResult(toolName, toolCallId, result);
      
      const stateManager = this.getStateManager();
      if (stateManager) stateManager.onToolResult(toolName, result);
      
      this._rePromptLLM('auto');
      return;
    }

    if (toolName === 'cancel_booking') {
      this._playFiller(toolName, preamble);
      let result;
      try {
        if (!this.agentId) throw new Error('Agent ID is missing.');
        if (!args.bookingId) throw new Error('bookingId is required.');
        // Verify ownership — make sure this booking belongs to this agent
        const existing = await dbService.prisma.booking.findFirst({
          where: { id: args.bookingId, agentId: this.agentId }
        });
        if (!existing) {
          result = { success: false, error: 'Booking not found or does not belong to this agent.' };
        } else if (existing.status === 'cancelled') {
          result = { success: false, error: 'This booking is already cancelled.' };
        } else {
          await dbService.prisma.booking.update({
            where: { id: args.bookingId },
            data: { status: 'cancelled' }
          });
          result = { success: true, message: 'Appointment successfully cancelled.' };
        }
      } catch (err) {
        console.error('[ToolExecutor] Error in internal_cancel_booking:', err);
        result = { error: err.message };
      }
      
      if (signal.aborted) return;
      
      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);
      this._appendToolResult(toolName, toolCallId, result);
      
      const stateManager = this.getStateManager();
      if (stateManager) stateManager.onToolResult(toolName, result);
      
      this._rePromptLLM('auto');
      return;
    }

    if (toolName === 'reschedule_booking') {
      this._playFiller(toolName, preamble);
      let result;
      try {
        if (!this.agentId) throw new Error('Agent ID is missing.');
        if (!args.bookingId || !args.startTime || !args.endTime) throw new Error('bookingId, startTime, and endTime are required.');
        const existing = await dbService.prisma.booking.findFirst({
          where: { id: args.bookingId, agentId: this.agentId }
        });
        if (!existing) {
          result = { success: false, error: 'Booking not found or does not belong to this agent.' };
        } else if (existing.status === 'cancelled') {
          result = { success: false, error: 'Cannot reschedule a cancelled booking. Please create a new one.' };
        } else {
          const newStart = new Date(args.startTime);
          const newEnd = new Date(args.endTime);
          // Check for conflicts at the new time (excluding the booking being rescheduled)
          const conflict = await dbService.prisma.booking.findFirst({
            where: {
              agentId: this.agentId,
              id: { not: args.bookingId },
              status: 'confirmed',
              startTime: { lt: newEnd },
              endTime: { gt: newStart }
            }
          });
          if (conflict) {
            result = { success: false, error: `That time slot is already booked (conflict from ${conflict.startTime.toISOString()} to ${conflict.endTime.toISOString()}). Please choose a different time.` };
          } else {
            await dbService.prisma.booking.update({
              where: { id: args.bookingId },
              data: { startTime: newStart, endTime: newEnd, status: 'confirmed' }
            });
            result = { success: true, message: `Appointment rescheduled to ${newStart.toISOString()}.` };
          }
        }
      } catch (err) {
        console.error('[ToolExecutor] Error in internal_reschedule_booking:', err);
        result = { error: err.message };
      }
      
      if (signal.aborted) return;
      
      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);
      this._appendToolResult(toolName, toolCallId, result);
      
      const stateManager = this.getStateManager();
      if (stateManager) stateManager.onToolResult(toolName, result);
      
      this._rePromptLLM('auto');
      return;
    }

    // -------------------------------------------------------------------------
    // NEW GENERAL / SALES TOOLS
    // -------------------------------------------------------------------------
    if (toolName === 'transfer_call') {
      this._playFiller(toolName, preamble);
      const result = { 
        success: true, 
        message: `Simulating transfer to ${args.department || 'a representative'}.` 
      };
      
      if (signal.aborted) return;
      
      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);
      this._appendToolResult(toolName, toolCallId, result);
      
      const stateManager = this.getStateManager();
      if (stateManager) stateManager.onToolResult(toolName, result);
      
      this._rePromptLLM('auto');
      return;
    }

    if (toolName === 'send_followup_email') {
      this._playFiller(toolName, preamble);
      let result;
      try {
        if (!this.currentContactId) {
          result = { success: false, error: "Cannot send email. Please use save_collected_data to collect the user's email address first." };
        } else {
          const contact = await dbService.prisma.contact.findUnique({
            where: { id: this.currentContactId }
          });

          if (!contact || !contact.email) {
            result = { success: false, error: "The saved contact does not have an email address. Please ask them for it and run save_collected_data." };
          } else {
            // Generate some generic content based on the request
            const subject = `Information regarding your request: ${args.content_type}`;
            const textContent = `Hello ${contact.name || ''},\n\nHere is the information you requested regarding: ${args.content_type}.\n\nThank you for reaching out!`;
            
            const sent = await EmailService.sendEmail(contact.email, subject, textContent);
            if (sent) {
              result = { success: true, message: `Successfully sent ${args.content_type} to ${contact.email}.` };
            } else {
              result = { success: true, message: `Simulated sending ${args.content_type} to ${contact.email} (EmailService not fully configured).` };
            }
          }
        }
      } catch (err) {
        console.error('[ToolExecutor] Error sending email:', err);
        result = { error: err.message };
      }
      
      if (signal.aborted) return;
      
      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);
      this._appendToolResult(toolName, toolCallId, result);
      
      const stateManager = this.getStateManager();
      if (stateManager) stateManager.onToolResult(toolName, result);
      
      this._rePromptLLM('auto');
      return;
    }

    if (toolName === 'send_whatsapp') {
      this._playFiller(toolName, preamble);
      let result;
      try {
        if (this._whatsappSent) {
          result = { success: true, message: "WhatsApp message already sent in this session. Do not call this tool again. Please conclude the call." };
        } else if (!this.currentContactId) {
          result = { success: false, error: "Cannot send WhatsApp message. Please use save_collected_data to collect the user's phone number first." };
        } else {
          const contact = await dbService.prisma.contact.findUnique({
            where: { id: this.currentContactId }
          });

          if (!contact || !contact.phone) {
            result = { success: false, error: "The saved contact does not have a phone number. Please ask them for it and run save_collected_data." };
          } else {
            const message = args.message;
            const sent = await WhatsAppService.sendMessage(contact.phone, message);
            this._whatsappSent = true;
            if (sent) {
              result = { success: true, message: `Successfully sent message via WhatsApp to ${contact.phone}.` };
            } else {
              result = { success: true, message: `Simulated sending message via WhatsApp to ${contact.phone} (WhatsAppService not fully configured).` };
            }
          }
        }
      } catch (err) {
        console.error('[ToolExecutor] Error sending WhatsApp:', err);
        result = { error: err.message };
      }
      
      if (signal.aborted) return;
      
      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);
      this._appendToolResult(toolName, toolCallId, result);
      
      const stateManager = this.getStateManager();
      if (stateManager) stateManager.onToolResult(toolName, result);
      
      this._rePromptLLM('auto');
      return;
    }

    if (toolName === 'get_pricing') {
      this._playFiller(toolName, preamble);
      
      // Basic mock pricing logic
      const item = (args.item_name || '').toLowerCase();
      let price = '$99.00';
      if (item.includes('consultation')) price = '$50.00';
      if (item.includes('premium')) price = '$299.00';
      
      const result = { 
        success: true, 
        message: `The standard pricing for ${args.item_name} is ${price}.` 
      };
      
      if (signal.aborted) return;
      
      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);
      this._appendToolResult(toolName, toolCallId, result);
      
      const stateManager = this.getStateManager();
      if (stateManager) stateManager.onToolResult(toolName, result);
      
      this._rePromptLLM('auto');
      return;
    }

    // -------------------------------------------------------------------------
    // BUILT-IN: server-side tool with executor
    // -------------------------------------------------------------------------
    if (this.registry.isBuiltIn(toolName)) {
      this._playFiller(toolName, preamble);

      let result;
      try {
        result = await this.registry.execute(toolName, args);
      } catch (err) {
        console.error(`[ToolExecutor] Error executing built-in tool ${toolName}:`, err);
        result = { error: err.message };
      }

      if (signal.aborted) return;

      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);
      this._appendToolResult(toolName, toolCallId, result);
      
      const stateManager = this.getStateManager();
      if (stateManager) stateManager.onToolResult(toolName, result);
      
      this._rePromptLLM('auto');
      return;
    }

    // -------------------------------------------------------------------------
    // WEBHOOK: outbound HTTP tool (Cal.com, Google Sheets, Zapier, etc.)
    // -------------------------------------------------------------------------
    if (this.registry.isWebhook(toolName)) {
      console.log(`[ToolExecutor] Executing webhook tool "${toolName}"`);
      this._playFiller(toolName, preamble);

      const webhookConfig = this.registry.getWebhookConfig(toolName);
      let result;
      try {
        result = await executeWebhookTool(webhookConfig, args);
      } catch (err) {
        console.error(`[ToolExecutor] Webhook tool "${toolName}" failed:`, err.message);
        result = { 
          success: false, 
          error: err.message,
          message: 'The external service is currently unavailable. Please let the caller know and offer an alternative.'
        };
      }

      if (signal.aborted) return;

      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);
      this._appendToolResult(toolName, toolCallId, result);
      
      const stateManager = this.getStateManager();
      if (stateManager) stateManager.onToolResult(toolName, result);
      
      this._rePromptLLM('auto');
      return;
    }

    // -------------------------------------------------------------------------
    // CUSTOM: frontend-routed tool
    // -------------------------------------------------------------------------
    if (this.registry.isCustom(toolName)) {
      console.log(`[ToolExecutor] Routing custom tool "${toolName}" to frontend.`);
      this._playFiller('generic', preamble);

      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);

      this.sendToClient({
        event: 'tool_execution_request',
        toolName,
        args,
        toolCallId
      });
      return;
    }

    // -------------------------------------------------------------------------
    // UNKNOWN tool — log and ignore (avoid silent failures)
    // -------------------------------------------------------------------------
    console.warn(`[ToolExecutor] Unknown tool "${toolName}" — not in registry. Ignoring.`);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Append an assistant tool_call message to the transcript. Returns the toolCallId. */
  _appendToolCall(toolName, args, preamble, llmToolCallId) {
    const toolCallId = llmToolCallId || ("call_" + Math.random().toString(36).substring(7));
    this.transcript.push({
      role: 'assistant',
      content: preamble || null,
      tool_calls: [{
        id: toolCallId,
        type: "function",
        function: { name: toolName, arguments: JSON.stringify(args) }
      }]
    });
    return toolCallId;
  }

  /** Append a tool result message to the transcript. */
  _appendToolResult(toolName, toolCallId, result) {
    this.transcript.push({
      role: 'tool',
      tool_call_id: toolCallId,
      name: toolName,
      content: JSON.stringify(result)
    });
  }

  /** Play a filler phrase over TTS to mask latency. */
  _playFiller(toolName, preamble) {
    const now = Date.now();
    if (now - this._lastFillerAt < this.FILLER_DEBOUNCE_MS) {
      // Another filler (or the model's own preamble) was just spoken —
      // avoid stacking a second one for a tool call fired moments later.
      return;
    }

    const text = (preamble && preamble.trim())
      ? preamble.trim()
      : this.registry.getFiller(toolName, this.getStateManager()?.language || 'en-US');

    this._lastFillerAt = now;
    this.tts.feedText(text + ' ');
    this.tts.flush();
  }

  /** Ask the LLM to generate the next response based on the updated transcript. */
  _rePromptLLM(toolChoice = 'auto') {
    const sm = this.getStateManager();
    this.llm.generateResponse(
      this.getRecentTranscript(), 
      this.registry.getAllSchemas(),
      toolChoice,
      sm ? sm.getContextInjection() : null
    );
  }
}

module.exports = { ToolExecutor };
