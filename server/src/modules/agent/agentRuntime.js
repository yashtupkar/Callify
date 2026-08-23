const { dbService } = require('../../services/DatabaseService');
const { ToolRegistry } = require('../../tools/ToolRegistry');
const { buildAgentPrompt } = require('../prompt/promptBuilder');
const { executeWebhookTool, buildToolSchema } = require('../../tools/WebhookToolExecutor');

/**
 * Loads an Agent from the database, builds its ToolRegistry, 
 * and generates its system prompt.
 * 
 * @param {string} agentId 
 * @returns {Promise<{ agent: object, registry: ToolRegistry, systemPrompt: string }>}
 */
async function loadAgentRuntime(agentId) {
  const agent = await dbService.prisma.agent.findUnique({ 
    where: { id: agentId } 
  });
  
  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  const registry = new ToolRegistry();

  // Load custom agent tools
  if (agent.tools) {
    let customTools = [];
    if (typeof agent.tools === 'string') {
      try { customTools = JSON.parse(agent.tools); } catch(e) {}
    } else {
      customTools = agent.tools;
    }
    
    if (Array.isArray(customTools)) {
      for (const tool of customTools) {
        if (!tool.name) continue;
        const schema = buildToolSchema(tool);

        if (tool.type === 'webhook' && tool.webhookUrl) {
          // Server-side HTTP webhook tool
          registry.registerWebhook(tool.name, schema, tool);
        } else {
          // Frontend-routed tool (default)
          registry.registerCustom(tool.name, schema);
        }
      }
    }
  }

  // Load dynamic data collection schema
  let dataCollection = null;
  if (agent.dataCollection) {
    try {
      dataCollection = typeof agent.dataCollection === 'string' 
        ? JSON.parse(agent.dataCollection) 
        : agent.dataCollection;
    } catch(e) {}
  }
  
  // Also check legacy dataToCollect for backward compatibility
  const legacyData = agent.tools?.dataToCollect;
  const fields = dataCollection || legacyData;
  
  if (fields && fields.length > 0) {
    registry.injectDataCollectionTool(fields);
  }

  // Build the dynamic prompt
  const systemPrompt = buildAgentPrompt({ 
    agent: {
      ...agent,
      dataCollection: fields
    }
  });

  return { agent, registry, systemPrompt };
}

module.exports = {
  loadAgentRuntime
};
