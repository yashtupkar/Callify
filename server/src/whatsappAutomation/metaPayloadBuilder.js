/**
 * metaPayloadBuilder.js
 *
 * Builds official Meta WhatsApp Cloud API (v20.0) message payloads from
 * validated normalized response objects.
 *
 * Reference:
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 *
 * Supported Meta Cloud API types:
 * - text
 * - interactive (button, list, cta_url, flow)
 * - image, video, document
 * - template
 * - location
 *
 * Note: 'handoff' is an internal event and should not be sent directly to Meta.
 */

const crypto = require('crypto');

/**
 * Normalizes a recipient phone number into a clean E.164 string without '+'.
 *
 * @param {string} to
 * @returns {string}
 */
function cleanRecipient(to) {
  return String(to || '')
    .replace(/@.*$/, '')
    .replace(/[^\d]/g, '');
}

/**
 * Builds Meta Cloud API JSON payload for a normalized response.
 *
 * @param {object} params
 * @param {string} params.recipient - Destination phone number / WhatsApp ID
 * @param {object} params.response - Normalized response object
 * @param {object} [params.context] - Extra context (e.g. templates, flows, connection configuration)
 * @returns {object} Meta Cloud API messages POST payload
 */
function buildMetaPayload({ recipient, response, context = {} }) {
  const to = cleanRecipient(recipient);
  if (!to) {
    throw new Error('Meta payload requires a valid recipient');
  }
  if (!response || typeof response !== 'object') {
    throw new Error('Meta payload requires a valid normalized response object');
  }

  const base = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
  };

  switch (response._type) {
    case 'text':
      return {
        ...base,
        type: 'text',
        text: {
          preview_url: false,
          body: response.text || '',
        },
      };

    case 'button': {
      const interactive = {
        type: 'button',
        body: { text: response.body || '' },
        action: {
          buttons: (response.buttons || []).slice(0, 3).map((b) => ({
            type: 'reply',
            reply: {
              id: String(b.id || '').slice(0, 256),
              title: String(b.title || '').slice(0, 20),
            },
          })),
        },
      };

      if (response.headerMedia?.url) {
        interactive.header = { type: response.headerMedia.type, [response.headerMedia.type]: { link: response.headerMedia.url } };
      } else if (response.header) {
        interactive.header = { type: 'text', text: String(response.header).slice(0, 60) };
      }
      if (response.footer) {
        interactive.footer = { text: String(response.footer).slice(0, 60) };
      }

      return {
        ...base,
        type: 'interactive',
        interactive,
      };
    }

    case 'list': {
      const interactive = {
        type: 'list',
        body: { text: response.body || '' },
        action: {
          button: String(response.buttonLabel || 'View Options').slice(0, 20),
          sections: (response.sections || []).slice(0, 10).map((sec) => ({
            title: String(sec.title || 'Options').slice(0, 24),
            rows: (sec.rows || []).slice(0, 10).map((r) => {
              const row = {
                id: String(r.id || '').slice(0, 200),
                title: String(r.title || '').slice(0, 24),
              };
              if (r.description) {
                row.description = String(r.description).slice(0, 72);
              }
              return row;
            }),
          })),
        },
      };

      if (response.header) {
        interactive.header = { type: 'text', text: String(response.header).slice(0, 60) };
      }
      if (response.footer) {
        interactive.footer = { text: String(response.footer).slice(0, 60) };
      }

      return {
        ...base,
        type: 'interactive',
        interactive,
      };
    }

    case 'cta_url': {
      const interactive = {
        type: 'cta_url',
        body: { text: response.body || '' },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: String(response.button?.title || 'Visit Link').slice(0, 20),
            url: response.button?.url || '',
          },
        },
      };

      if (response.headerMedia?.url) {
        interactive.header = { type: response.headerMedia.type, [response.headerMedia.type]: { link: response.headerMedia.url } };
      } else if (response.header) {
        interactive.header = { type: 'text', text: String(response.header).slice(0, 60) };
      }
      if (response.footer) {
        interactive.footer = { text: String(response.footer).slice(0, 60) };
      }

      return {
        ...base,
        type: 'interactive',
        interactive,
      };
    }

    case 'media': {
      const mediaType = response.mediaType || 'image';
      const mediaPayload = {};

      if (response.mediaId) {
        mediaPayload.id = response.mediaId;
      } else if (response.url) {
        mediaPayload.link = response.url;
      } else {
        throw new Error('Media message requires either a url or a mediaId');
      }

      if (response.caption) {
        mediaPayload.caption = String(response.caption).slice(0, 1024);
      }
      if (mediaType === 'document' && response.filename) {
        mediaPayload.filename = String(response.filename).slice(0, 255);
      }

      return {
        ...base,
        type: mediaType,
        [mediaType]: mediaPayload,
      };
    }

    case 'template': {
      const configuredTemplates = context.templates || context.connection?.credentials?.templates || null;
      let templateConfig = null;

      if (configuredTemplates && typeof configuredTemplates === 'object') {
        if (Array.isArray(configuredTemplates)) {
          templateConfig = configuredTemplates.find(
            (t) => t.name === response.name && (!t.language || t.language === response.language)
          );
        } else if (configuredTemplates[response.name]) {
          templateConfig = configuredTemplates[response.name];
        }
      }

      // If strict template validation is enabled and template not configured
      if (context.strictTemplateCheck && !templateConfig) {
        throw new Error(`Template '${response.name}' is not configured or approved for this account`);
      }

      const components = buildTemplateComponents(response, templateConfig);

      return {
        ...base,
        type: 'template',
        template: {
          name: response.name,
          language: {
            code: response.language || 'en_US',
          },
          ...(components && components.length > 0 ? { components } : {}),
        },
      };
    }

    case 'flow': {
      const configuredFlows = context.flows || context.connection?.credentials?.flows || null;
      if (configuredFlows && Array.isArray(configuredFlows) && !configuredFlows.includes(response.flowId)) {
        throw new Error(`Flow ID '${response.flowId}' is not authorized for this account`);
      }

      const flowToken = response.flowToken || `flow_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const flowMessageVersion = context.flowMessageVersion || '3';

      const flowActionPayload = {
        ...(response.screen ? { screen: response.screen } : {}),
        ...(response.data ? { data: response.data } : {}),
      };

      const interactive = {
        type: 'flow',
        body: { text: response.body || 'Please complete the form.' },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: flowMessageVersion,
            flow_token: flowToken,
            flow_id: response.flowId,
            flow_cta: String(response.cta || 'Start').slice(0, 20),
            flow_action: 'navigate',
            ...(Object.keys(flowActionPayload).length > 0 ? { flow_action_payload: flowActionPayload } : {}),
          },
        },
      };

      if (response.header) {
        interactive.header = { type: 'text', text: String(response.header).slice(0, 60) };
      }
      if (response.footer) {
        interactive.footer = { text: String(response.footer).slice(0, 60) };
      }

      return {
        ...base,
        type: 'interactive',
        interactive,
      };
    }

    case 'location': {
      const location = {
        latitude: response.latitude,
        longitude: response.longitude,
      };
      if (response.name) location.name = String(response.name).slice(0, 100);
      if (response.address) location.address = String(response.address).slice(0, 255);

      return {
        ...base,
        type: 'location',
        location,
      };
    }

    case 'handoff':
      // Handoff is an internal event; return null so caller knows not to send direct payload
      return null;

    default:
      return {
        ...base,
        type: 'text',
        text: {
          preview_url: false,
          body: response.text || response.body || '',
        },
      };
  }
}

/**
 * Builds template components array from normalized template response and optional config.
 */
function buildTemplateComponents(response, config) {
  // If explicit components provided (e.g., for template button URL parameters), use them
  if (Array.isArray(response.components) && response.components.length > 0) {
    return response.components;
  }

  const params = response.parameters || {};

  // If parameters is an array of strings or parameter objects
  if (Array.isArray(params)) {
    if (params.length === 0) return [];
    return [
      {
        type: 'body',
        parameters: params.map((p) => {
          if (typeof p === 'object' && p !== null && p.type) return p;
          return { type: 'text', text: String(p) };
        }),
      },
    ];
  }

  // If parameters is an object map like { customer_name: "Yash", order_id: "ORD123" }
  if (typeof params === 'object' && params !== null) {
    const keys = Object.keys(params);
    if (keys.length === 0) return [];

    // If template config defines ordered variable keys
    if (config && Array.isArray(config.bodyVariables)) {
      const parameters = config.bodyVariables.map((varName) => ({
        type: 'text',
        text: String(params[varName] !== undefined ? params[varName] : ''),
      }));
      return [{ type: 'body', parameters }];
    }

    // Default: map object values in key order
    const parameters = keys.map((k) => ({
      type: 'text',
      text: String(params[k]),
    }));
    return [{ type: 'body', parameters }];
  }

  return [];
}

module.exports = {
  buildMetaPayload,
  cleanRecipient,
  buildTemplateComponents,
};
