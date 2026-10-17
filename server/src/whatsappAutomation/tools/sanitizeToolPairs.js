/**
 * Providers reject a request unless every assistant `tool_calls` message is
 * immediately followed by one tool message per call id (and tool messages never
 * appear on their own). Drop anything that violates that, e.g. after trimming
 * the history window or when a user message slipped in mid tool call.
 */
function sanitizeToolPairs(messages) {
  const out = [];
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (message.role === 'tool') continue; // only valid right after its assistant call (handled below)

    if (message.role === 'assistant' && message.tool_calls?.length) {
      const ids = message.tool_calls.map((call) => call.id);
      const replies = [];
      let j = i + 1;
      while (j < messages.length && messages[j].role === 'tool') { replies.push(messages[j]); j += 1; }
      const answered = ids.every((id) => replies.some((reply) => reply.tool_call_id === id));
      if (answered) {
        out.push(message, ...replies.filter((reply) => ids.includes(reply.tool_call_id)));
      } else if (message.content) {
        out.push({ role: 'assistant', content: message.content });
      }
      i = j - 1;
      continue;
    }
    out.push(message);
  }
  return out;
}

module.exports = { sanitizeToolPairs };
