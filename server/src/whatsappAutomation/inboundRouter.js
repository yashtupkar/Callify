const { dbService } = require('../services/DatabaseService');
const { createWhatsAppAutomationProvider } = require('./factory');
const { handleMessages } = require('./runtime');

class WhatsAppAutomationInboundRouter {
  static async handle(req, res) {
    try {
      const id = req.params.connectionId || req.query.connectionId;
      let connection = null;

      if (id) {
        connection = await dbService.prisma.whatsAppConnection.findFirst({
          where: { id, enabled: true },
          include: { automation: { include: { tools: true } } },
        });
      }

      // If connectionId not provided in URL, match dynamically based on request details
      if (!connection) {
        if (req.method === 'GET') {
          const verifyToken = req.query['hub.verify_token'];
          if (verifyToken) {
            connection = await dbService.prisma.whatsAppConnection.findFirst({
              where: { verifyToken, enabled: true },
              include: { automation: { include: { tools: true } } },
            });
          }
        } else if (req.method === 'POST') {
          const body = req.body || {};
          const metaPhoneId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
          const wabaId = body.entry?.[0]?.id;

          if (metaPhoneId) {
            connection = await dbService.prisma.whatsAppConnection.findFirst({
              where: { phoneNumberId: String(metaPhoneId), enabled: true },
              include: { automation: { include: { tools: true } } },
            });
          }
          if (!connection && wabaId) {
            connection = await dbService.prisma.whatsAppConnection.findFirst({
              where: { businessId: String(wabaId), enabled: true },
              include: { automation: { include: { tools: true } } },
            });
          }
        }
      }

      // Handle Meta GET Webhook Handshake Verification
      if (req.method === 'GET') {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode === 'subscribe' && challenge) {
          if (connection && connection.verifyToken && connection.verifyToken !== token) {
            console.warn('[WhatsAppAutomationInboundRouter] Verify token mismatch:', {
              connectionId: connection.id,
              received: token ? '***' : '(empty)',
            });
            return res.status(403).send('Verify token mismatch');
          }
          console.log('[WhatsAppAutomationInboundRouter] Webhook verified successfully, returning challenge');
          res.setHeader('Content-Type', 'text/plain');
          return res.status(200).send(String(challenge));
        }
        return res.status(400).send('Invalid webhook request');
      }

      if (!connection) {
        // Return 200 anyway to prevent Meta from retrying with a non-existing token
        console.warn('[WhatsAppAutomationInboundRouter] No active connection found for incoming webhook');
        return res.status(200).send('OK');
      }

      if (connection.automation?.status === 'paused') {
        return res.status(200).send('OK');
      }

      const provider = createWhatsAppAutomationProvider(connection);

      if (!provider.verifyInbound(req)) {
        console.warn('[WhatsAppAutomationInboundRouter] Invalid signature on incoming webhook', {
          connectionId: connection.id,
        });
        return res.status(401).send('Invalid signature');
      }

      // Handle delivery status updates (sent, delivered, read, failed) idempotently
      const hasStatusUpdates = _webhookHasStatusUpdates(req.body);
      if (hasStatusUpdates) {
        // Respond immediately to avoid Meta retrying
        res.status(200).send('OK');
        if (typeof provider.parseStatusUpdates === 'function') {
          const statusUpdates = provider.parseStatusUpdates(req);
          await _processStatusUpdates(statusUpdates, connection);
        }
        return;
      }

      const messages = provider.parseInbound(req);
      // Respond 200 OK immediately so Meta does not timeout or retry
      res.status(200).send('OK');

      if (messages && messages.length > 0) {
        await handleMessages({ automation: connection.automation, connection, provider, messages });
      }
    } catch (error) {
      console.error('[WhatsAppAutomationInboundRouter] Error:', error.message);
      if (!res.headersSent) res.status(500).send('Internal error');
    }
  }
}

/**
 * Checks whether the incoming Meta webhook payload contains only status updates (no messages).
 */
function _webhookHasStatusUpdates(body) {
  if (!body || body.object !== 'whatsapp_business_account') return false;
  const entry = body.entry?.[0];
  const value = entry?.changes?.[0]?.value;
  if (!value) return false;

  const hasStatuses = Array.isArray(value.statuses) && value.statuses.length > 0;
  const hasMessages = Array.isArray(value.messages) && value.messages.length > 0;

  return hasStatuses && !hasMessages;
}

/**
 * Processes delivery status updates. Currently logs them; can be extended to update
 * a message store once message persistence is added.
 */
async function _processStatusUpdates(statusUpdates, connection) {
  for (const update of statusUpdates) {
    console.log('[WhatsAppAutomationInboundRouter] Message status update:', {
      connectionId: connection.id,
      automationId: connection.automationId,
      messageId: update.providerMessageId,
      status: update.status,
      timestamp: update.timestamp,
    });

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
