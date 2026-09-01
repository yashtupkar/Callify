/**
 * agentBuilder.js
 * 
 * Handles the interactive chat for building and configuring AI agents.
 */

const { OpenAI } = require('openai');

const BUILDER_SYSTEM_PROMPT = `You are an expert AI agent configuration assistant acting as an Interactive Wizard. Your job is to help users configure a voice AI agent through a structured conversation.

You will be given the CURRENT AGENT CONFIGURATION and the CHAT HISTORY.
Your goal is to proactively ask the user important questions before generating the final configuration.

The agent configuration has the following fields:
- name, initialMessage, systemPrompt, conversationGuidelines, dataToCollect, voiceId, language, timezone, enableWhatsAppConfirmation, enableEmailConfirmation.

INTERACTIVE WIZARD RULES:
1. DO NOT generate the full agent configuration immediately. Instead, act as a consultant.
2. If the user's initial request is vague (e.g., "I want a customer support agent"), you MUST ask them clarifying questions ONE BY ONE (or in small logical groups).
3. IMPORTANT QUESTIONS TO ASK (if not already provided by the user):
   - What language should the agent speak?
   - What is the business name and what are its operating/availability hours?
   - What should the conversation style be? (e.g., directly ask for the name, or do some conversational small talk first?)
   - Lead Qualification/Handoff Logic (Provide options! e.g., "Which qualifies a lead? 1: Owns home AND bill > $100. 2: Owns home only. 3: Any interested homeowner.")
   - What CRM or campaign data is available at the start of the call?
   - Do you want the agent to use any of our built-in capabilities? (e.g., Calendar Booking, Call Transfers, Email Follow-ups, Pricing lookups)
   - Do you want the agent to automatically send a confirmation message via WhatsApp or Email after successfully helping the caller?
4. Give the user multiple-choice options whenever possible to make it easy to respond.
5. Once you have gathered sufficient context across the chat history, or if the user explicitly says they are done/ready, you can generate the final updated configuration.
6. Be conversational, friendly, and concise in your 'reply'. Medium length conversational statements.
7. If you are updating the \`conversationGuidelines\`, you MUST format it as a highly structured document with "Sequential Flow", "Zero-Loop Policy", and numbered "Phases" (e.g., Phase 1: Opening, Phase 2: Booking). Mention specific tool calls using [TOOL: tool_name] notation and outline logic for different edge cases.
   AVAILABLE BUILT-IN TOOLS TO USE IN GUIDELINES:
   - \`check_availability\` (Check calendar for free slots)
   - \`create_booking\` (Book a slot on the calendar)
   - \`get_bookings\`, \`cancel_booking\`, \`reschedule_booking\` (Managing existing appointments)
   - \`save_collected_data\` (Saving lead info to CRM - REQUIRED before booking/emailing)
   - \`transfer_call\` (Transfer to human agent/department)
   - \`send_followup_email\` (Send brochure/quote via email)
   - \`send_whatsapp\` (Send brochure/quote/link via WhatsApp)
   - \`get_pricing\` (Look up standard pricing)
8. If you are updating the configuration, return the completely updated fields in the \`updatedConfig\` object. Only include fields that have a value. If you are just asking a question and haven't decided on the config yet, you can leave \`updatedConfig\` empty or null.

YOU MUST RESPOND IN STRICT JSON FORMAT:
{
  "reply": "Your conversational response, asking the next question and providing options.",
  "updatedConfig": { ... } // Leave empty/null if just asking a question
}
Do not include markdown blocks like \`\`\`json around the output. Just output the raw JSON object.
`;

async function processBuilderChat(message, currentConfig, chatHistory) {
  try {
    const client = new OpenAI({
      baseURL: process.env.OPENROUTER_API_KEY
        ? 'https://openrouter.ai/api/v1'
        : undefined,
      apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
    });

    const model = process.env.BUILDER_LLM_MODEL || process.env.LLM_MODEL || 'openai/gpt-4o-mini';

    const messages = [
      { role: 'system', content: BUILDER_SYSTEM_PROMPT },
      { role: 'user', content: `CURRENT AGENT CONFIGURATION:\n${JSON.stringify(currentConfig, null, 2)}` }
    ];

    if (chatHistory && chatHistory.length > 0) {
      chatHistory.forEach(msg => {
        messages.push({ role: msg.role, content: msg.content });
      });
    }

    messages.push({ role: 'user', content: message });

    console.log(`[AgentBuilder] Processing message: "${message}"`);

    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) {
      console.warn('[AgentBuilder] Empty response from LLM.');
      return null;
    }

    try {
      // Sometimes Claude wraps the JSON in markdown blocks even when told not to.
      let jsonString = content;
      if (jsonString.startsWith('```json')) {
        jsonString = jsonString.replace(/^```json/, '').replace(/```$/, '').trim();
      } else if (jsonString.startsWith('```')) {
        jsonString = jsonString.replace(/^```/, '').replace(/```$/, '').trim();
      }
      
      const parsed = JSON.parse(jsonString);
      return parsed;
    } catch (parseError) {
      console.error('[AgentBuilder] Failed to parse JSON from LLM. Falling back to raw text. Response was:\n', content);
      // Fallback: If it just replied with text, show it to the user so the conversation isn't broken
      return { reply: content, updatedConfig: null };
    }

  } catch (err) {
    console.error('[AgentBuilder] Failed to process builder chat:', err.message);
    return null;
  }
}

module.exports = { processBuilderChat };
