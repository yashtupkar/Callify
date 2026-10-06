const { dbService } = require('../services/DatabaseService');
const { createWhatsAppAutomationProvider } = require('./factory');
const { handleMessages } = require('./runtime');

class WhatsAppAutomationInboundRouter {
  static async handle(req, res) {
    try {
      const id = req.params.connectionId || req.query.connectionId;
      const where = id ? { id, enabled: true } : { enabled: true };
      const connection = await dbService.prisma.whatsAppConnection.findFirst({ where, include: { automation: { include: { tools: true } } } });
      if (!connection || connection.automation.status === 'paused') return res.status(404).send('No active WhatsApp automation');
      const provider = createWhatsAppAutomationProvider(connection);
      if (req.method === 'GET') {
        const result = provider.verifyHandshake(req);
        return result.ok ? res.status(200).send(result.challenge || 'OK') : res.status(403).send(result.error || 'Forbidden');
      }
      if (!provider.verifyInbound(req)) return res.status(401).send('Invalid signature');
      const messages = provider.parseInbound(req);
      res.status(200).send('OK');
      await handleMessages({ automation: connection.automation, connection, provider, messages });
    } catch (error) {
      console.error('[WhatsAppAutomationInboundRouter]', error);
      if (!res.headersSent) res.status(500).send('Internal error');
    }
  }
}
module.exports = { WhatsAppAutomationInboundRouter };
