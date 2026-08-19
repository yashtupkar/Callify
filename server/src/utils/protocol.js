/**
 * Protocol validation for WebSocket payloads
 */

const MAX_PAYLOAD_SIZE = 1024 * 50; // 50 KB max for JSON payloads
const MAX_PROMPT_LENGTH = 10000;
const MAX_TOOLS = 20;

function validateSessionStart(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload structure');
  }

  if (payload.type !== 'session.start') {
    throw new Error(`Expected type "session.start", got "${payload.type}"`);
  }

  const config = payload.config;
  if (!config || typeof config !== 'object') {
    throw new Error('Missing or invalid config object');
  }

  // Validate System Prompt
  if (config.systemPrompt && typeof config.systemPrompt !== 'string') {
    throw new Error('systemPrompt must be a string');
  }
  if (config.systemPrompt && config.systemPrompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`systemPrompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`);
  }

  // Validate First Message
  if (config.firstMessage && typeof config.firstMessage !== 'string') {
    throw new Error('firstMessage must be a string');
  }
  if (config.firstMessage && config.firstMessage.length > 2000) {
    throw new Error('firstMessage exceeds maximum length of 2000 characters');
  }

  // Validate Tools
  if (config.customTools) {
    if (!Array.isArray(config.customTools)) {
      throw new Error('customTools must be an array');
    }
    if (config.customTools.length > MAX_TOOLS) {
      throw new Error(`customTools array exceeds maximum allowed length of ${MAX_TOOLS}`);
    }
    // Basic tool schema validation
    for (const tool of config.customTools) {
      if (!tool || tool.type !== 'function' || !tool.function || typeof tool.function.name !== 'string') {
        throw new Error('Invalid customTools schema. Expected OpenAI function structure.');
      }
    }
  }

  return {
    type: 'session.start',
    config: {
      systemPrompt: config.systemPrompt || '',
      firstMessage: config.firstMessage || '',
      voiceId: config.voiceId || null,
      language: config.language || 'en-US',
      dataToCollect: Array.isArray(config.dataToCollect) ? config.dataToCollect : [],
      customTools: config.customTools || []
    }
  };
}

function validateToolResult(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload structure');
  }

  if (payload.type !== 'tool.completed') {
    throw new Error(`Expected type "tool.completed", got "${payload.type}"`);
  }

  if (typeof payload.toolName !== 'string' || !payload.toolName) {
    throw new Error('toolName is required and must be a string');
  }

  return {
    type: 'tool.completed',
    toolCallId: payload.toolCallId || null,
    toolName: payload.toolName,
    result: payload.result
  };
}

module.exports = {
  MAX_PAYLOAD_SIZE,
  validateSessionStart,
  validateToolResult
};
