const { WhatsAppToolRegistry } = require('./WhatsAppToolRegistry');
const { WhatsAppToolExecutor } = require('./WhatsAppToolExecutor');
const { BUILT_IN_TOOLS, registerBuiltInTools } = require('./builtinTools');
const { buildCustomTool } = require('./customTool');

/**
 * Build the registry for one automation: all built-in CRM/general tools, minus
 * any the automation disabled, plus its enabled webhook tools.
 */
function buildRegistryForAutomation(automation) {
  const rows = Array.isArray(automation?.tools) ? automation.tools : [];
  const disabled = new Set(rows.filter((tool) => tool.enabled === false).map((tool) => tool.name));
  const registry = registerBuiltInTools(new WhatsAppToolRegistry(), { disabled });
  for (const tool of rows) {
    if (tool.enabled === false) continue;
    if (tool.config?.type === 'custom') {
      const def = buildCustomTool({ ...tool.config, name: tool.config.name || tool.name });
      if (def) { registry.remove(def.name); registry.register(def); }
      continue;
    }
    if (!tool.name || !tool.schema) continue;
    if (tool.config?.type === 'webhook' && tool.config?.webhookUrl) {
      registry.remove(tool.name);
      registry.registerWebhook(tool.name, tool.schema, tool.config);
    }
  }
  return registry;
}

module.exports = {
  WhatsAppToolRegistry, WhatsAppToolExecutor, BUILT_IN_TOOLS, registerBuiltInTools, buildRegistryForAutomation,
};
