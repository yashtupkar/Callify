require('dotenv').config();
const { dbService } = require('./src/services/DatabaseService');

async function run() {
  const autos = await dbService.prisma.whatsAppAutomation.findMany({ include: { tools: true } });
  for (const auto of autos) {
    if (JSON.stringify(auto).includes('7898297769') || JSON.stringify(auto).includes('Yash')) {
      console.log('Found in Automation:', auto.id, auto.name);
      if (auto.systemPrompt && auto.systemPrompt.includes('789')) console.log('systemPrompt:', auto.systemPrompt);
      if (auto.description && auto.description.includes('789')) console.log('description:', auto.description);
      for (const tool of auto.tools) {
        if (JSON.stringify(tool).includes('789')) console.log('Tool:', tool.name, JSON.stringify(tool.config));
      }
    }
  }
}

run().catch(console.error).finally(() => process.exit(0));
