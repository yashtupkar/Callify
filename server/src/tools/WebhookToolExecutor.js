/**
 * WebhookToolExecutor
 *
 * Executes a tool by making an outbound HTTP request to a user-configured
 * webhook URL. Supports GET and POST, custom headers, and Bearer token auth.
 *
 * Tool config shape (stored in agent.tools JSON array):
 * {
 *   "type": "webhook",
 *   "name": "book_appointment",
 *   "description": "Books an appointment via Cal.com",
 *   "webhookUrl": "https://api.cal.com/v1/bookings",
 *   "method": "POST",
 *   "headers": { "Authorization": "Bearer {{CAL_API_KEY}}" },
 *   "parameters": [
 *     { "name": "name",  "type": "string", "description": "...", "required": true },
 *     { "name": "start", "type": "string", "description": "...", "required": true }
 *   ]
 * }
 *
 * The LLM-provided args are sent as the request body (POST) or query params (GET).
 * The webhook response is returned to the LLM as the tool result.
 */

const https = require('https');
const http = require('http');

/**
 * Interpolate {{ENV_VAR}} tokens inside string values using process.env.
 * Allows users to store secret references like {{CAL_API_KEY}} in their config.
 */
function interpolateEnvVars(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{\{([^}]+)\}\}/g, (_, varName) => {
    return process.env[varName.trim()] || '';
  });
}

function interpolateHeaders(headers = {}) {
  const result = {};
  for (const [key, val] of Object.entries(headers)) {
    result[key] = interpolateEnvVars(val);
  }
  return result;
}

/**
 * Execute a webhook tool call.
 *
 * @param {object} toolConfig  The full tool config object from agent.tools
 * @param {object} args        The LLM-provided arguments
 * @returns {Promise<object>}  The webhook response parsed as JSON (or text fallback)
 */
async function executeWebhookTool(toolConfig, args) {
  const method = (toolConfig.method || 'POST').toUpperCase();
  const rawUrl = interpolateEnvVars(toolConfig.webhookUrl);
  const customHeaders = interpolateHeaders(toolConfig.headers || {});

  // Build the request body, applying paramMapping and staticBody if configured.
  // paramMapping: renames/re-paths flat LLM args to dot-notation keys
  //   e.g. { attendeeName: 'attendee.name', startTime: 'start' }
  // staticBody: injects hardcoded values alongside the mapped args
  //   e.g. { 'attendee.timeZone': 'Asia/Kolkata', 'attendee.language': 'en' }
  function buildBody(rawArgs) {
    const mapping = toolConfig.paramMapping || {};
    const statics = toolConfig.staticBody || {};
    const hasMapping = Object.keys(mapping).length > 0 || Object.keys(statics).length > 0;

    if (!hasMapping) return rawArgs; // Fast path: send args as-is

    const result = {};

    // Apply mapped params (rename + support dot-notation paths)
    for (const [argKey, targetPath] of Object.entries(mapping)) {
      if (rawArgs[argKey] === undefined) continue;
      setPath(result, targetPath, rawArgs[argKey]);
    }

    // Pass through any args not mentioned in the mapping
    for (const [argKey, val] of Object.entries(rawArgs)) {
      if (!mapping[argKey]) setPath(result, argKey, val);
    }

    // Apply static body values
    for (const [path, val] of Object.entries(statics)) {
      setPath(result, path, interpolateEnvVars(String(val)));
    }

    return result;
  }

  // Set a dot-notation path on an object, creating intermediate objects as needed
  function setPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  let url = rawUrl;
  let bodyStr = null;

  if (method === 'GET') {
    const params = new URLSearchParams(args).toString();
    url = params ? `${rawUrl}?${params}` : rawUrl;
  } else {
    bodyStr = JSON.stringify(buildBody(args));
  }

  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === 'https:';
  const requestLib = isHttps ? https : http;

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'Callify-Webhook/1.0',
    ...customHeaders,
    ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
  };

  console.log(`[WebhookToolExecutor] ${method} ${url}`);
  if (bodyStr) console.log(`[WebhookToolExecutor] Body: ${bodyStr.slice(0, 300)}`);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers,
      timeout: 10000 // 10s max — voice calls need fast responses
    };

    const req = requestLib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        console.log(`[WebhookToolExecutor] Response ${res.statusCode}: ${data.slice(0, 200)}`);

        if (res.statusCode >= 400) {
          resolve({
            success: false,
            statusCode: res.statusCode,
            error: `Webhook returned HTTP ${res.statusCode}`,
            body: data.slice(0, 500)
          });
          return;
        }

        try {
          resolve({ success: true, ...JSON.parse(data) });
        } catch {
          // Non-JSON response — return as plain text
          resolve({ success: true, result: data.trim().slice(0, 1000) });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Webhook timed out after 10 seconds'));
    });

    req.on('error', (err) => {
      console.error('[WebhookToolExecutor] Request error:', err.message);
      reject(err);
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**

 * Build an OpenAI-compatible tool schema from a tool config object.
 * Works for both webhook tools and frontend (custom) tools.
 *
 * @param {object} toolConfig
 * @returns {object} OpenAI function schema
 */
function buildToolSchema(toolConfig) {
  const properties = {};
  const required = [];

  for (const param of (toolConfig.parameters || [])) {
    const key = param.name;
    properties[key] = {
      type: param.type || 'string',
      description: param.description || ''
    };
    if (param.required) required.push(key);
  }

  return {
    type: 'function',
    function: {
      name: toolConfig.name,
      description: toolConfig.description || '',
      parameters: {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false
      }
    }
  };
}

module.exports = { executeWebhookTool, buildToolSchema };
