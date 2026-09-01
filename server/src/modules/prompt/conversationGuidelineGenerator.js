/**
 * conversationGuidelineGenerator.js
 *
 * Generates structured, production-quality "Conversation Guidelines" for any
 * AI calling agent using an LLM call.  The output is a phase-by-phase prose
 * document (similar to Sarvam-style guidelines) that defines:
 *   - The sequential call flow (greeing, collecting, booking, etc.)
 *   - Where each tool is called in the flow
 *   - How to handle edge cases (wrong person, no slots, etc.)
 *   - Guardrails (what the agent must never do)
 *
 * Usage:
 *   const { generateConversationGuidelines } = require('./conversationGuidelineGenerator');
 *
 *   // During agent creation / update (from your API route):
 *   const guidelines = await generateConversationGuidelines(agentConfig);
 *   // Store guidelines in your DB (agent.conversationGuidelines field)
 *   // The promptBuilder will inject them into the system prompt.
 *
 * The generated guidelines are SEPARATE from the core system prompt rules
 * (tool calling protocol, voice style, anti-assumption rules, etc.).
 * They define WHAT the agent does in sequence; the core prompt defines HOW.
 */

const { OpenAI } = require('openai');

// ---------------------------------------------------------------------------
// The meta-prompt used to generate guidelines.
// Instructs the LLM to produce structured, imperative-voice, phase-based
// guidelines that match the Sarvam/Callify format the operator showed.
// ---------------------------------------------------------------------------
const GENERATION_SYSTEM_PROMPT = `You are an expert AI conversation designer specialising in voice calling agents for businesses.

Your task: given an agent configuration, write structured "Conversation Guidelines" that define the exact step-by-step call flow the AI agent must follow.

REQUIRED FORMAT:
- Write in clear, imperative prose (third-person passive or imperative, e.g. "The caller is greeted..." or "Ask for...").
- Organise into numbered PHASES that cover the full call lifecycle.
- Inside each phase, list steps sequentially — one action per step.
- Use "[TOOL: tool_name]" notation at the exact step where a tool call must happen.
- Include a "Sequential Flow" rule at the top (one question at a time, await response).
- Include a "Zero-Loop Policy" (never repeat text verbatim; re-asks are shorter).
- End with a "Guardrails" section listing what the agent must NEVER do.
- Keep language precise and actionable — no vague advice like "be helpful".
- Tailor every detail to the specific industry, agent purpose, and available tools.

DO NOT include:
- JSON, markdown headers, code blocks, or bullet-point lists.
- Generic platitudes like "provide excellent service" or "be empathetic".
- Instructions that duplicate the core prompt rules (tool calling, voice style, etc.).

OUTPUT: Return ONLY the guidelines text, starting directly with "Sequential Flow:".`.trim();

// ---------------------------------------------------------------------------

/**
 * Generate AI conversation guidelines for an agent.
 *
 * @param {object} agentConfig - The agent configuration object (same shape as
 *   what ConversationManager receives in startConversation).
 * @returns {Promise<string|null>} Generated guidelines string, or null on failure.
 */
async function generateConversationGuidelines(agentConfig) {
  try {
    const client = new OpenAI({
      baseURL: process.env.OPENROUTER_API_KEY
        ? 'https://openrouter.ai/api/v1'
        : undefined,
      apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
    });

    const model = process.env.GUIDELINE_MODEL || process.env.LLM_MODEL || 'openai/gpt-4o-mini';

    // Build a rich description of the agent for the generator
    const agentDescription = _buildAgentDescription(agentConfig);

    console.log(`[GuidelineGenerator] Generating guidelines for agent: ${agentConfig.assistantName || 'unnamed'}`);

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: GENERATION_SYSTEM_PROMPT },
        { role: 'user',   content: `Generate conversation guidelines for this agent:\n\n${agentDescription}` }
      ],
      temperature   : 0.25,   // Low temperature for consistent, structured output
      max_tokens    : 2500,
    });

    const guidelines = response.choices?.[0]?.message?.content?.trim();
    if (!guidelines) {
      console.warn('[GuidelineGenerator] Empty response from LLM.');
      return null;
    }

    console.log(`[GuidelineGenerator] Guidelines generated (${guidelines.length} chars).`);
    return guidelines;

  } catch (err) {
    console.error('[GuidelineGenerator] Failed to generate guidelines:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Serialise the agent config into a human-readable description for the LLM.
 * @param {object} cfg
 * @returns {string}
 */
function _buildAgentDescription(cfg) {
  const lines = [];

  lines.push(`Agent Name: ${cfg.assistantName || 'AI Assistant'}`);
  lines.push(`Business / Organisation: ${cfg.businessName || 'the business'}`);
  lines.push(`Industry / Domain: ${cfg.industry || 'general business'}`);
  lines.push(`Call Type: ${cfg.callType || 'inbound'}`);
  lines.push(`Language: ${cfg.language || 'en-US'}`);

  if (cfg.systemPrompt) {
    lines.push(`Agent Purpose / Role:\n${cfg.systemPrompt}`);
  } else if (cfg.purpose) {
    lines.push(`Agent Purpose: ${cfg.purpose}`);
  }

  if (cfg.goals && cfg.goals.length > 0) {
    lines.push(`Primary Goals:\n- ${(Array.isArray(cfg.goals) ? cfg.goals : [cfg.goals]).join('\n- ')}`);
  }

  if (cfg.dataToCollect && cfg.dataToCollect.length > 0) {
    lines.push(`Data to Collect from Caller: ${cfg.dataToCollect.join(', ')}`);
  }

  // Describe the tools available
  const toolNames = [];
  if (cfg.customTools && Array.isArray(cfg.customTools)) {
    for (const t of cfg.customTools) {
      if (t.name) toolNames.push(`${t.name}${t.description ? ': ' + t.description : ''}`);
    }
  }
  // Always mention the internal CRM tools
  toolNames.push('internal_check_availability: Check the agent\'s calendar for open slots on a given date');
  toolNames.push('internal_create_booking: Book an appointment on the internal calendar');
  toolNames.push('internal_cancel_booking: Cancel an existing appointment by booking ID');
  toolNames.push('internal_reschedule_booking: Move an existing appointment to a new date/time');
  toolNames.push('internal_get_bookings: Retrieve the caller\'s existing bookings');
  toolNames.push('save_collected_data: Save caller contact info (name, phone, email, etc.) to the CRM');
  toolNames.push('end_call: End the phone call after a polite goodbye');

  lines.push(`Available Tools:\n- ${toolNames.join('\n- ')}`);

  if (cfg.instructions) {
    lines.push(`Additional Instructions:\n${cfg.instructions}`);
  }

  if (cfg.rules && cfg.rules.length > 0) {
    lines.push(`Hard Rules:\n- ${(Array.isArray(cfg.rules) ? cfg.rules : [cfg.rules]).join('\n- ')}`);
  }

  return lines.join('\n\n');
}

module.exports = { generateConversationGuidelines };
