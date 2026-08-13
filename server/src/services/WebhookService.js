const { executeDentalTool } = require('../integrations/llm/dentalTools');

class WebhookService {
  /**
   * Executes a tool call. If the tool is a dynamic webhook tool (has a webhook_url property),
   * it will send a POST request. Otherwise, it falls back to built-in tools.
   */
  static async executeTool(toolName, args, agentTools = []) {
    try {
      // Find the tool definition in the agent's configured tools
      const toolDef = agentTools.find(t => t.function && t.function.name === toolName);

      if (toolDef && toolDef.function.webhook_url) {
        console.log(`[WebhookService] Firing webhook for tool ${toolName} to ${toolDef.function.webhook_url}`);
        
        const response = await fetch(toolDef.function.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool: toolName, args: args })
        });
        
        if (!response.ok) {
          throw new Error(`Webhook returned status ${response.status}`);
        }
        
        const result = await response.json();
        return result;
      }
      
      // Fallback for built-in testing tools (like dental DB)
      console.log(`[WebhookService] No webhook URL found, falling back to built-in execution for ${toolName}`);
      return executeDentalTool(toolName, args);

    } catch (err) {
      console.error(`[WebhookService] Error executing tool ${toolName}:`, err);
      return { error: `Failed to execute tool ${toolName}: ${err.message}` };
    }
  }
}

module.exports = { WebhookService };
