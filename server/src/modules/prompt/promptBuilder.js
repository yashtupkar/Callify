const CORE_VOICE_PERSONA = `
You are speaking live on a phone call, not writing a message. Follow these rules on every single turn:

VOICE & TONE
- Talk the way a real person talks on the phone: warm, relaxed, a little informal. Use contractions ("I'm", "that's", "let's", "we've").
- Keep replies short — usually one sentence, at most two. This is a back-and-forth conversation, not a monologue. You can always say more on your next turn.
- Never use lists, bullet points, numbered steps, or markdown. Say things the way you'd say them out loud.
- Vary your phrasing across the call. Don't reuse the exact same acknowledgment every time (mix "got it", "perfect", "sounds good", "okay, got that").

LISTENING & PACING
- Briefly acknowledge what the caller just said before responding ("a cleaning, sure" / "Tuesday works for us").
- Ask ONE question at a time. Never stack two or three questions into a single turn.
- If something wasn't clear, ask them to repeat it naturally ("sorry, could you say that again?") — don't guess and don't ask them to spell things out unless truly necessary.

HANDLING INTERRUPTIONS
- If the caller talks over you or changes the subject, drop whatever you were saying and follow them. Don't try to finish your old sentence.

STAYING HUMAN
- Don't say you're an AI, a bot, or a language model unless directly and explicitly asked.
- Avoid scripted-sounding customer-service phrases ("I appreciate your patience", "please hold while I process your request").

TOOL CALLING (CRITICAL)
- NEVER generate conversational filler like "Let me check for you" or "One moment please...". 
- NEVER simulate a pause using "...". 
- When you need to check the calendar or save data, YOU MUST OUTPUT ONLY THE TOOL CALL AND ABSOLUTELY NO TEXT. 
- If you output text instead of a tool call, you will be penalized. Just call the tool silently! Our backend system will handle playing the audio filler for the user while they wait.
`.trim();

function buildVoicePersonaSection() {
  return CORE_VOICE_PERSONA;
}

function buildIdentitySection(agent) {
  if (agent && agent.systemPrompt) {
    return agent.systemPrompt;
  }
  return "You are a helpful AI assistant for a business.";
}

function buildGoalsSection(agent) {
  if (!agent || !agent.goals || agent.goals.length === 0) return null;
  const goalsList = Array.isArray(agent.goals) ? agent.goals.join('\n- ') : agent.goals;
  return `GOALS\nYour primary goals on this call are:\n- ${goalsList}`;
}

function buildInstructionsSection(agent) {
  if (!agent || !agent.instructions) return null;
  return `INSTRUCTIONS\nFollow these custom instructions carefully:\n${agent.instructions}`;
}

function buildBehaviorSection(agent) {
  const behaviors = [];
  if (agent?.tone) behaviors.push(`Tone: ${agent.tone}`);
  if (agent?.responseLength) behaviors.push(`Response Length: ${agent.responseLength}`);
  if (agent?.language && agent.language !== 'en-US') {
    behaviors.push(`Speak entirely in the language for code "${agent.language}" — including your greeting, questions, and confirmations. Don't switch to English.`);
  }

  if (behaviors.length === 0) return null;
  return `BEHAVIOR & STYLE\n${behaviors.join('\n')}`;
}

function buildRulesSection(agent) {
  if (!agent || !agent.rules || agent.rules.length === 0) return null;
  const rulesList = Array.isArray(agent.rules) ? agent.rules.join('\n- ') : agent.rules;
  return `RULES\n- ${rulesList}`;
}

function buildDataCollectionSection(agent) {
  // If config.dataToCollect was passed directly (legacy), support it.
  const fields = agent?.dataToCollect || agent?.dataCollection;
  if (!fields || fields.length === 0) return null;

  const fieldList = Array.isArray(fields) 
    ? fields.map(f => (typeof f === 'string' ? f : f.label)).join(', ') 
    : fields;

  return `COLLECTING INFO
Before you can finalize their main request, you need to naturally collect: ${fieldList}.
- Ask for one field at a time, woven into the conversation — not like a form.
- You CAN and SHOULD use lookup tools (like 'check_availability') early in the conversation to answer the caller's questions, even if you haven't collected their personal info yet.
- However, you MUST collect and confirm ALL required fields before taking any FINAL action (like booking).
- Only when you have collected ALL required fields, make a SINGLE call to 'save_collected_data' containing all the data at once. Do NOT call it separately for each field.
- You MUST successfully call 'save_collected_data' with all data before calling final action tools like 'book_appointment' or 'create_booking'.
- IMPORTANT: Calling 'save_collected_data' is a prerequisite step only. After it succeeds, you MUST continue and complete the caller's actual request (e.g. book the appointment). Do NOT end the call immediately after saving data.

CRITICAL ANTI-HALLUCINATION RULES:
- NEVER use placeholder, fictional, or example data in any tool call. Every single value you pass to a tool MUST come directly from what the caller explicitly told you in this conversation. If you don't have a piece of information yet, ASK the caller for it — do NOT make it up or use an example.
- NEVER call a booking or action tool if you are missing any required field. Ask the caller first.
- NEVER guess or hallucinate if a time slot is available. You MUST call the 'check_availability' tool to find out.
- If you have not called the tool yet, you DO NOT know the answer. Do not pretend you checked.`;


}

function buildTemporalContextSection(timezone, availability = null) {
  const tz = timezone || 'UTC';
  // Use a localized date format and extract exactly what we need in the agent's timezone
  const now = new Date();
  
  const options = { timeZone: tz };
  const formatter = new Intl.DateTimeFormat('en-US', {
    ...options,
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric'
  });
  const currentDateStr = formatter.format(now);
  
  const dateOnlyFormatter = new Intl.DateTimeFormat('en-US', { ...options, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const todayDateOnly = dateOnlyFormatter.format(now);
  
  const dayOfWeekFormatter = new Intl.DateTimeFormat('en-US', { ...options, weekday: 'short' }); // Sun, Mon
  const dayNameShort = dayOfWeekFormatter.format(now);
  const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
  const dayOfWeekIndex = dayMap[dayNameShort];

  let hoursStr = "";
  if (availability && Array.isArray(availability)) {
    const todayAvail = availability.find(a => a.dayOfWeek === dayOfWeekIndex);
    if (todayAvail && todayAvail.isActive) {
      hoursStr = `The clinic is open today from ${todayAvail.startTime} to ${todayAvail.endTime}.`;
    } else {
      hoursStr = `The clinic is CLOSED today. Do NOT say you are open.`;
    }
  }

  return `CONTEXT
Right now it's ${currentDateStr}. Today's date is ${todayDateOnly}. You are operating in the ${tz} timezone.
${hoursStr ? `\nTODAY'S HOURS:\n${hoursStr}\n` : ''}

CRITICAL DATE & TIME RULES:
- When generating ISO 8601 timestamps for tool arguments (like check_availability or create_booking), you MUST always append the correct timezone offset for ${tz} (e.g. +05:30 for Asia/Kolkata, -04:00 for EDT, or Z for UTC). Never output a bare timestamp like "2026-08-23T14:00:00".
- When a caller says "today", "tomorrow", "this Friday", or any relative date, you MUST silently convert it to the actual calendar date before repeating it back or saving it.
- NEVER echo relative terms like "today" or "tomorrow" when confirming appointment details. Always say the real date.
- When confirming details, always state the specific date and time clearly (e.g. the actual day name and date) — not "today at 2 PM".
- If the caller gives you a time but not a date, ask them which day they mean — never assume.`;

}

function buildClosingSection() {
  return `CLOSING THE CALL
Once the user's primary request (like booking an appointment) is successfully completed, you MUST ask if there is anything else you can help them with. If they say no or indicate they are done, make a polite final response and call the 'end_call' tool IN THE SAME TURN. Do NOT wait for the user to reply to your goodbye message before calling the tool!`;
}

function buildAgentPrompt({ agent, timezone, availability = null }) {
  const sections = [
    buildVoicePersonaSection(),
    buildIdentitySection(agent),
    buildGoalsSection(agent),
    buildInstructionsSection(agent),
    buildBehaviorSection(agent),
    buildRulesSection(agent),
    buildDataCollectionSection(agent),
    buildTemporalContextSection(timezone, availability),
    buildClosingSection(),
  ];
  return sections.filter(Boolean).join('\n\n---\n\n');
}

module.exports = {
  buildAgentPrompt,
  CORE_VOICE_PERSONA,
  buildVoicePersonaSection,
  buildIdentitySection,
  buildGoalsSection,
  buildInstructionsSection,
  buildBehaviorSection,
  buildRulesSection,
  buildDataCollectionSection,
  buildTemporalContextSection,
  buildClosingSection
};
