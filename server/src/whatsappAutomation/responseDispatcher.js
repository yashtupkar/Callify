/**
 * responseDispatcher.js
 *
 * Central response dispatcher for WhatsApp automation.
 * Routes normalized response types to the appropriate provider adapter.
 *
 * Architecture:
 *   AI Response / Raw Text
 *         ↓
 *   normalizeWhatsAppResponse()
 *         ↓
 *   Capability & Security Check
 *         ↓
 *   Provider Adapter (Meta Cloud API / Baileys)
 *         ↓
 *   Provider API / Network
 */

const { normalizeWhatsAppResponse, extractPlainText, VALID_RESPONSE_TYPES } = require('./responseNormalizer');
const { buildMetaPayload } = require('./metaPayloadBuilder');
const { dbService } = require('../services/DatabaseService');
const { WhatsAppAutomationLogService } = require('./logService');

const DEFAULT_CAPABILITIES = {
  buttons: true,
  lists: true,
  ctaUrl: true,
  media: true,
  templates: true,
  flows: true,
  location: true,
};

/**
 * Checks whether the given response type is supported by the connection's capabilities.
 *
 * @param {string} type
 * @param {object} capabilities
 * @returns {boolean}
 */
function isCapabilityEnabled(type, capabilities = {}) {
  const caps = { ...DEFAULT_CAPABILITIES, ...capabilities };
  switch (type) {
    case 'button':
      return caps.buttons !== false;
    case 'list':
      return caps.lists !== false;
    case 'cta_url':
      return caps.ctaUrl !== false;
    case 'media':
      return caps.media !== false;
    case 'template':
      return caps.templates !== false;
    case 'flow':
      return caps.flows !== false;
    case 'location':
      return caps.location !== false;
    default:
      return true;
  }
}

/**
 * Dispatches a WhatsApp response to the appropriate provider implementation.
 *
 * @param {object} params
 * @param {object} params.provider - WhatsAppProvider instance (CloudApiProvider or BaileysProvider)
 * @param {string} params.recipient - Destination phone number / WhatsApp JID
 * @param {object|string} params.response - Raw or normalized response
 * @param {object} [params.context] - Additional context (connection, automation, session)
 * @returns {Promise<{ success: boolean, messageId?: string, type: string, response: object, error?: string }>}
 */
async function sendWhatsAppResponse({ provider, recipient, response, context = {} }) {
  if (!provider) {
    throw new Error('Provider is required to send a WhatsApp response');
  }
  if (!recipient) {
    throw new Error('Recipient is required to send a WhatsApp response');
  }

  // Step 1: Normalize & Validate response
  // Skip normalization if response is already normalized (has valid _type)
  let normalized;
  if (response && typeof response === 'object' && VALID_RESPONSE_TYPES.has(response._type)) {
    normalized = response;
  } else {
    normalized = normalizeWhatsAppResponse(response);
  }

  // Step 2: Capability check
  const capabilities = context.capabilities || context.connection?.credentials?.capabilities || {};
  if (!isCapabilityEnabled(normalized._type, capabilities)) {
    console.warn(`[ResponseDispatcher] Capability for '${normalized._type}' is disabled on this account. Falling back to plain text.`);
    const fallbackText = extractPlainText(normalized);
    normalized = {
      _type: 'text',
      text: fallbackText || "I'm sorry, I couldn't process that request. How else can I help?",
    };
  }

  const providerName = provider.constructor?.name || 'UnknownProvider';

  // Step 3: Handle internal HUMAN HANDOFF event
  if (normalized._type === 'handoff') {
    return handleHumanHandoff({ provider, recipient, response: normalized, context });
  }

  // Step 4: Route based on Provider type
  let result;
  if (providerName === 'CloudApiProvider') {
    result = await sendMetaCloudResponse({ provider, recipient, response: normalized, context });
  } else if (providerName === 'BaileysProvider') {
    result = await sendBaileysResponse({ provider, recipient, response: normalized, context });
  } else {
    // Generic WhatsAppProvider fallback
    result = await sendGenericResponse({ provider, recipient, response: normalized, context });
  }

  // Increment message counter on successful send
  if (result?.success && context?.connectionId && context?.contactWaId) {
    try {
      await dbService.prisma.whatsAppAutomationSession.updateMany({
        where: { connectionId: context.connectionId, contactWaId: context.contactWaId },
        data: { messagesSent: { increment: 1 } },
      });
    } catch (err) {
      console.error('[ResponseDispatcher] Failed to increment sent counter:', err.message);
    }
  }

  // Log outgoing message
  if (context?.automationId) {
    try {
      const log = WhatsAppAutomationLogService.build(context.automationId, {
        connectionId: context.connectionId,
        contactWaId: context.contactWaId,
      });
      await log.info('message', 'outgoing', `Sent ${normalized._type} message`, {
        messageType: normalized._type,
        recipient: maskPhoneNumber(recipient),
        success: result?.success || false,
        error: result?.error,
      });
    } catch (err) {
      if (err.code !== 'P2021' && !err.message?.includes('does not exist')) {
        console.error('[ResponseDispatcher] Log error:', err.message);
      }
    }
  }

  return result;
}

/**
 * Handles internal human handoff event.
 */
async function handleHumanHandoff({ provider, recipient, response, context }) {
  const messageText = response.message || "I'll connect you with our team. Please wait a moment.";

  try {
    // 1. Update session status if session object exists
    if (context.session) {
      context.session.status = 'human_handoff';
      context.session.isHandoff = true;
    }

    // 2. Send customer the polite transition message
    let sendResult = null;
    if (typeof provider.sendText === 'function') {
      sendResult = await provider.sendText(recipient, messageText);
    }

    console.log('[ResponseDispatcher] Human handoff triggered for recipient:', {
      recipient: maskPhoneNumber(recipient),
      provider: provider.constructor?.name,
      success: true,
    });

    return {
      success: true,
      type: 'handoff',
      handoff: true,
      message: messageText,
      result: sendResult,
      response,
    };
  } catch (err) {
    console.error('[ResponseDispatcher] Error during human handoff transition:', err.message);
    return {
      success: false,
      type: 'handoff',
      handoff: true,
      error: err.message,
      response,
    };
  }
}

/**
 * Sends a message via Meta WhatsApp Cloud API.
 */
async function sendMetaCloudResponse({ provider, recipient, response, context }) {
  try {
    const payload = buildMetaPayload({
      recipient,
      response,
      context: {
        ...context,
        connection: context.connection,
        templates: context.templates || context.connection?.credentials?.templates,
        flows: context.flows || context.connection?.credentials?.flows,
      },
    });

    if (!payload) {
      throw new Error(`Failed to generate Meta payload for response type: ${response._type}`);
    }

    const apiResult = await provider.sendMessagePayload(payload);
    const messageId = apiResult?.messages?.[0]?.id;

    console.log('[ResponseDispatcher] Meta message sent successfully:', {
      provider: 'meta_cloud',
      phoneNumberId: provider.phoneNumberId,
      recipient: maskPhoneNumber(recipient),
      responseType: response._type,
      messageId,
      success: true,
    });

    return {
      success: true,
      messageId,
      type: response._type,
      response,
      rawResult: apiResult,
    };
  } catch (err) {
    const metaError = err.metaError || {};
    console.error('[ResponseDispatcher] Meta Cloud API send failed:', {
      provider: 'meta_cloud',
      phoneNumberId: provider.phoneNumberId,
      recipient: maskPhoneNumber(recipient),
      responseType: response._type,
      errorCode: metaError.code || err.code,
      errorMessage: metaError.message || err.message,
    });

    // Attempt safe text fallback if a rich message failed
    if (response._type !== 'text') {
      try {
        console.warn(`[ResponseDispatcher] Attempting plain text fallback for failed '${response._type}' message`);
        const fallbackText = extractPlainText(response) || "Sorry, I couldn't send that message right now. Please try again.";
        const fallbackResult = await provider.sendText(recipient, fallbackText);
        return {
          success: true,
          fallback: true,
          originalType: response._type,
          type: 'text',
          messageId: fallbackResult?.messages?.[0]?.id,
          response: { _type: 'text', text: fallbackText },
        };
      } catch (fallbackErr) {
        console.error('[ResponseDispatcher] Fallback text send also failed:', fallbackErr.message);
      }
    }

    return {
      success: false,
      type: response._type,
      error: err.message,
      response,
    };
  }
}

/**
 * Sends a message via Baileys (WhatsApp Web API).
 */
async function sendBaileysResponse({ provider, recipient, response, context }) {
  try {
    const to = recipient;

    switch (response._type) {
      case 'text':
        await provider.sendText(to, response.text);
        break;

      case 'button':
        if (typeof provider.sendPoll === 'function' && Array.isArray(response.buttons) && response.buttons.length > 0) {
          const options = response.buttons.map((b) => b.title);
          await provider.sendPoll(to, response.body || 'Choose an option:', options);
        } else {
          // Format as numbered text list
          const formatted = extractPlainText(response);
          await provider.sendText(to, formatted);
        }
        break;

      case 'list': {
        const formatted = extractPlainText(response);
        await provider.sendText(to, formatted);
        break;
      }

      case 'cta_url': {
        const formatted = extractPlainText(response);
        await provider.sendText(to, formatted);
        break;
      }

      case 'media':
        if (response.url) {
          if (response.mediaType === 'image') {
            await provider.sendImage(to, response.url, response.caption);
          } else if (response.mediaType === 'document') {
            await provider.sendDocument(to, response.url, response.filename);
          } else {
            await provider.sendImage(to, response.url, response.caption);
          }
        } else {
          await provider.sendText(to, extractPlainText(response));
        }
        break;

      case 'location': {
        const formatted = extractPlainText(response);
        await provider.sendText(to, formatted);
        break;
      }

      default: {
        const text = extractPlainText(response);
        if (text) await provider.sendText(to, text);
        break;
      }
    }

    console.log('[ResponseDispatcher] Baileys message sent successfully:', {
      provider: 'baileys',
      recipient: maskPhoneNumber(recipient),
      responseType: response._type,
      success: true,
    });

    return {
      success: true,
      type: response._type,
      response,
    };
  } catch (err) {
    console.error('[ResponseDispatcher] Baileys send error:', err.message);
    return {
      success: false,
      type: response._type,
      error: err.message,
      response,
    };
  }
}

/**
 * Generic fallback for any other WhatsAppProvider subclass.
 */
async function sendGenericResponse({ provider, recipient, response, context }) {
  try {
    const text = extractPlainText(response);
    if (typeof provider.sendText === 'function') {
      await provider.sendText(recipient, text);
    }
    return {
      success: true,
      type: response._type,
      response,
    };
  } catch (err) {
    console.error('[ResponseDispatcher] Generic send error:', err.message);
    return {
      success: false,
      type: response._type,
      error: err.message,
      response,
    };
  }
}

/**
 * Helper to mask recipient phone numbers in log outputs for privacy.
 */
function maskPhoneNumber(phone) {
  const str = String(phone || '');
  if (str.length <= 4) return '****';
  return str.slice(0, 3) + '****' + str.slice(-2);
}

module.exports = {
  sendWhatsAppResponse,
  isCapabilityEnabled,
  DEFAULT_CAPABILITIES,
  maskPhoneNumber,
};
