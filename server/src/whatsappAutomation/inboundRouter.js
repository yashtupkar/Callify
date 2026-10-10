const { dbService } = require('../services/DatabaseService');
const { createWhatsAppAutomationProvider } = require('./factory');
const { handleMessages } = require('./runtime');
const { extractPhoneNumberIds, extractWabaIds, scopeBodyToConnection } = require('./webhookScope');

const CONNECTION_INCLUDE = { automation: { include: { tools: true } } };

async function findConnectionsForPayload(body) {
  const found = new Map();
  for (const phoneNumberId of extractPhoneNumberIds(body)) {
    const rows = await dbService.prisma.whatsAppConnection.findMany({
      where: { phoneNumberId, enabled: true },
      include: CONNECTION_INCLUDE,
    });
    for (const row of rows) found.set(row.id, row);
  }
  if (found.size === 0) {
    for (const businessId of extractWabaIds(body)) {
      const rows = await dbService.prisma.whatsAppConnection.findMany({
        where: { businessId, enabled: true },
        include: CONNECTION_INCLUDE,
      });
      for (const row of rows) found.set(row.id, row);
    }
  }
  return [...found.values()];
}

function scopeIfPossible(body, connection) {
  const hasIdentifiers = extractPhoneNumberIds(body).length > 0 || extractWabaIds(body).length > 0;
  if (!hasIdentifiers || (!connection.phoneNumberId && !connection.businessId)) return body;
  return scopeBodyToConnection(body, connection);
}

class WhatsAppAutomationInboundRouter {
  static async handleVerification(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode !== 'subscribe' || !challenge || !token) return res.status(400).send('Invalid webhook request');

    const id = req.params.connectionId || req.query.connectionId;
    const candidates = id
      ? await dbService.prisma.whatsAppConnection.findMany({ where: { id: String(id), enabled: true } })
      : await dbService.prisma.whatsAppConnection.findMany({ where: { verifyToken: String(token), enabled: true } });
    const envToken = process.env.WHATSAPP_VERIFY_TOKEN;
    const ok = candidates.some((connection) => connection.verifyToken && connection.verifyToken === token)
      || (envToken && envToken === token);
    if (!ok) {
      console.warn('[WhatsAppAutomationInboundRouter] Webhook verification rejected');
      return res.status(403).send('Verify token mismatch');
    }
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(String(challenge));
  }

  static async handle(req, res) {
    try {
      if (req.method === 'GET') return await WhatsAppAutomationInboundRouter.handleVerification(req, res);
      if (req.method !== 'POST') return res.status(405).send('Method not allowed');

      const body = req.body || {};
      const urlId = req.params.connectionId || req.query.connectionId;
      let connections = [];
      if (urlId) {
        const connection = await dbService.prisma.whatsAppConnection.findFirst({
          where: { id: String(urlId), enabled: true },
          include: CONNECTION_INCLUDE,
        });
        if (connection) connections = [connection];
      } else {
        connections = await findConnectionsForPayload(body);
      }

      if (connections.length === 0) {
        // 200 so Meta does not retry for connections that no longer exist
        console.warn('[WhatsAppAutomationInboundRouter] No active connection found for incoming webhook');
        return res.status(200).send('OK');
      }

      // Several connections may claim the same identifiers; only those whose signature
      // verifies are trusted, so one tenant cannot receive another tenant's traffic.
      const targets = [];
      for (const connection of connections) {
        if (connection.automation?.status === 'paused') continue;
        const provider = createWhatsAppAutomationProvider(connection);
        if (!provider.verifyInbound(req)) {
          console.warn('[WhatsAppAutomationInboundRouter] Invalid signature on incoming webhook', { connectionId: connection.id });
          continue;
        }
        targets.push({ connection, provider, body: scopeIfPossible(body, connection) });
      }

      if (targets.length === 0) {
        const allPaused = connections.every((connection) => connection.automation?.status === 'paused');
        return allPaused ? res.status(200).send('OK') : res.status(401).send('Invalid signature');
      }

      // Acknowledge first so Meta never times out and retries while the LLM is running
      res.status(200).send('OK');

      await Promise.allSettled(targets.map(async ({ connection, provider, body: scoped }) => {
        const scopedReq = { ...req, body: scoped, headers: req.headers, rawBody: req.rawBody };
        try {
          if (typeof provider.parseStatusUpdates === 'function') {
            const statusUpdates = provider.parseStatusUpdates(scopedReq);
            if (statusUpdates.length) await _processStatusUpdates(statusUpdates, connection);
          }
          const messages = provider.parseInbound(scopedReq);
          if (messages && messages.length > 0) {
            await handleMessages({ automation: connection.automation, connection, provider, messages });
          }
        } catch (error) {
          console.error('[WhatsAppAutomationInboundRouter] Processing error:', { connectionId: connection.id, error: error.message });
        }
      }));
    } catch (error) {
      console.error('[WhatsAppAutomationInboundRouter] Error:', error.message);
      if (!res.headersSent) res.status(500).send('Internal error');
    }
  }
}
/**
 * Processes delivery status updates. Currently logs them; can be extended to update
 * a message store once message persistence is added.
 */
async function _processStatusUpdates(statusUpdates, connection) {
  try {
    await require('../campaigns').onStatusUpdates(connection, statusUpdates);
  } catch (err) {
    console.error('[WhatsAppAutomationInboundRouter] Campaign status hook failed:', err.message);
  }
  for (const update of statusUpdates) {
    if (update.status === 'failed' && update.errors && update.errors.length > 0) {
      const err = update.errors[0];
      console.error('[WhatsAppAutomationInboundRouter] Message delivery failed:', {
        connectionId: connection.id,
        messageId: update.providerMessageId,
        errorCode: err.code,
        errorTitle: err.title,
      });
    }
  }
}

module.exports = { WhatsAppAutomationInboundRouter };
