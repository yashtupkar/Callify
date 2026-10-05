/**
 * /wa-live WebSocket handler
 *
 * Streams live WhatsApp conversation transcript/tool events to admins
 * watching the live-chat page. Authenticated via JWT cookie (same auth
 * middleware as REST). Subscribes to ALL active session adapters; can
 * optionally filter to a specific key via ?key=<storeKey>.
 */

const url = require('url');
const { store } = require('../services/WhatsAppSessionStore');
const { authenticateSocket, requireRoleSocket } = require('./authSocket');

function setupWhatsAppLiveHandler(ws, req) {
  const { query } = url.parse(req.url, true);
  const targetKey = query.key || null;

  authenticateSocket(ws, req)
    .then(user => {
      if (!requireRoleSocket(user, ['admin'])) {
        ws.send(JSON.stringify({ type: 'error', error: 'forbidden' }));
        ws.close();
        return;
      }

      ws.send(JSON.stringify({ type: 'connected', key: targetKey }));

      const handlers = [];

      for (const [key, entry] of store.sessions.entries()) {
        if (targetKey && key !== targetKey) continue;
        const handler = (msg) => {
          if (ws.readyState !== ws.OPEN) return;
          try {
            ws.send(JSON.stringify({ type: 'event', key, event: msg }));
          } catch (e) { /* ignore */ }
        };
        entry.adapter.setControlMessageHandler(handler);
        handlers.push({ adapter: entry.adapter, handler });
      }

      ws.on('message', (raw) => {
        try {
          const data = JSON.parse(raw.toString());
          if (data.type === 'switch' && typeof data.key === 'string') {
            // Re-bind to a different key
            for (const h of handlers) h.adapter.setControlMessageHandler(null);
            handlers.length = 0;
            const newTarget = data.key;
            for (const [key, entry] of store.sessions.entries()) {
              if (newTarget && key !== newTarget) continue;
              const handler = (msg) => {
                if (ws.readyState !== ws.OPEN) return;
                try { ws.send(JSON.stringify({ type: 'event', key, event: msg })); } catch (e) {}
              };
              entry.adapter.setControlMessageHandler(handler);
              handlers.push({ adapter: entry.adapter, handler });
            }
            ws.send(JSON.stringify({ type: 'switched', key: newTarget }));
          }
        } catch (e) { /* ignore */ }
      });

      ws.on('close', () => {
        for (const h of handlers) {
          try { h.adapter.setControlMessageHandler(null); } catch (e) {}
        }
      });
    })
    .catch(err => {
      console.warn('[WhatsAppLive] auth failed:', err.message);
      try { ws.send(JSON.stringify({ type: 'error', error: 'unauthenticated' })); ws.close(); } catch (e) {}
    });
}

module.exports = { setupWhatsAppLiveHandler };
