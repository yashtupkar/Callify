const { ConversationManager } = require('../src/services/ConversationManager');
const { CallStateManager } = require('../src/services/CallStateManager');
const assert = require('assert');

// Mock channel adapter
class MockChannel {
  on() {}
  sendControlMessage() {}
  sendAudio() {}
}

async function runEvals() {
  console.log('Running Callify Eval Harness...');

  // 1. Mocking transcript slicing boundary
  const cm = new ConversationManager(new MockChannel());
  
  // Fill transcript to exceed MAX_CONTEXT_MESSAGES (40)
  for(let i = 0; i < 45; i++) {
    cm.transcript.push({ role: 'user', content: 'hello ' + i });
  }
  
  // Index 5 is exactly 40 messages from the end (45 - 40 = 5)
  // We place a tool result at index 5 and the tool call at index 4.
  // The slice should expand to include index 4.
  cm.transcript[5] = { role: 'tool', name: 'check_availability', content: '{"available":true}' };
  cm.transcript[4] = { role: 'assistant', tool_calls: [{ id: '123', type: 'function', function: { name: 'check_availability', arguments: '{}' } }] };

  const recent = cm.getRecentTranscript();
  
  // recent[0] should be the assistant message, recent[1] should be the tool message
  assert.strictEqual(recent[0].role, 'assistant', 'Transcript slicing split tool call from result!');
  assert.strictEqual(recent[1].role, 'tool', 'Transcript slicing split tool call from result!');
  console.log('✓ Transcript trimming boundary test passed');

  // 2. Phase transitions
  const stateManager = new CallStateManager({
    dataFields: ['Name', 'Phone']
  });
  
  assert.strictEqual(stateManager.phase, 'GREETING');
  stateManager.startCollecting();
  assert.strictEqual(stateManager.phase, 'COLLECTING');
  
  stateManager.markFieldCollected('Name', 'Alice');
  assert.strictEqual(stateManager.phase, 'COLLECTING');
  
  stateManager.markFieldCollected('Phone', '123456');
  assert.strictEqual(stateManager.phase, 'CONFIRMING');
  
  stateManager.onToolResult('save_collected_data', { success: true });
  assert.strictEqual(stateManager.phase, 'ACTING');
  
  stateManager.onToolResult('create_booking', { success: true });
  assert.strictEqual(stateManager.phase, 'CLOSING');
  
  console.log('✓ Phase transitions passed');

  // 3. No "confirmed" language before tool result
  // This verifies logic that an external LLM evaluation tool might run on generated transcripts
  const mockTranscript = [
    { role: 'user', content: 'Can you book 10am?' },
    { role: 'assistant', content: 'You are booked!' }
  ];
  
  const hasPrematureConfirmation = mockTranscript.some((m, idx) => {
    if (m.role === 'assistant' && (m.content.toLowerCase().includes('booked') || m.content.toLowerCase().includes('confirmed'))) {
      // Check if there was a tool result before this
      const precedingTool = mockTranscript.slice(0, idx).some(prev => prev.role === 'tool' && prev.name === 'create_booking');
      return !precedingTool;
    }
    return false;
  });
  
  assert.strictEqual(hasPrematureConfirmation, true, 'Test helper: Premature confirmation detected');
  console.log('✓ Confirmation language detection logic passed');

  console.log('All evals passed successfully.');
}

runEvals().catch(err => {
  console.error('Eval failed:', err.message);
  process.exit(1);
});
