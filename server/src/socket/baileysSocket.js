/**
 * Baileys Socket Handler
 *
 * WebSocket handler for real-time Baileys instance updates (QR codes, connection status).
 */

const { WebSocket } = require('ws');
const { baileysInstanceManager } = require('../services/BaileysInstanceManager');

// Connection rate limiting to prevent rapid reconnections
const connectionMap = new Map(); // IP -> { count, lastConnectionTime }
const RATE_LIMIT_WINDOW = 5000; // 5 seconds
const MAX_CONNECTIONS_PER_WINDOW = 10; // Increased for development

function setupBaileysSocketHandler(ws, req) {
  const clientIp = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();

  // Rate limiting check
  const clientData = connectionMap.get(clientIp) || { count: 0, lastConnectionTime: 0 };
  
  if (now - clientData.lastConnectionTime < RATE_LIMIT_WINDOW) {
    if (clientData.count >= MAX_CONNECTIONS_PER_WINDOW) {
      console.warn(`[BaileysSocket] Rate limit exceeded for ${clientIp}, closing connection`);
      ws.close(1008, 'Rate limit exceeded');
      return;
    }
    clientData.count++;
  } else {
    clientData.count = 1;
    clientData.lastConnectionTime = now;
  }
  connectionMap.set(clientIp, clientData);

  console.log('[BaileysSocket] New connection established from:', clientIp);

  let pingInterval = null;
  let isAlive = true;

  // Send initial status of all instances with error handling
  // Use setTimeout to ensure connection is fully established
  setTimeout(() => {
    try {
      if (ws.readyState === WebSocket.OPEN && isAlive) {
        const instances = baileysInstanceManager.getAllInstances();
        ws.send(JSON.stringify({
          type: 'initial',
          instances
        }));
        console.log('[BaileysSocket] Sent initial instances to client');
      } else {
        console.warn('[BaileysSocket] WebSocket not ready, skipping initial data send');
      }
    } catch (err) {
      console.error('[BaileysSocket] Error sending initial instances:', err);
      try {
        if (ws.readyState === WebSocket.OPEN && isAlive) {
          ws.send(JSON.stringify({
            type: 'initial',
            instances: []
          }));
        }
      } catch (sendErr) {
        console.error('[BaileysSocket] Error sending fallback data:', sendErr);
      }
    }
  }, 100);

  // Listen for QR code events
  const onQR = ({ instanceId, qr }) => {
    if (ws.readyState === WebSocket.OPEN && isAlive) {
      try {
        ws.send(JSON.stringify({
          type: 'qr',
          instanceId,
          qr
        }));
      } catch (err) {
        console.error('[BaileysSocket] Error sending QR event:', err);
      }
    }
  };

  // Listen for connection update events
  const onConnectionUpdate = ({ instanceId, status, phoneNumber, shouldReconnect }) => {
    if (ws.readyState === WebSocket.OPEN && isAlive) {
      try {
        ws.send(JSON.stringify({
          type: 'connectionUpdate',
          instanceId,
          status,
          phoneNumber,
          shouldReconnect
        }));
      } catch (err) {
        console.error('[BaileysSocket] Error sending connection update event:', err);
      }
    }
  };

  // Listen for message events (for live monitoring)
  const onMessage = ({ instanceId, message }) => {
    if (ws.readyState === WebSocket.OPEN && isAlive) {
      try {
        ws.send(JSON.stringify({
          type: 'message',
          instanceId,
          message
        }));
      } catch (err) {
        console.error('[BaileysSocket] Error sending message event:', err);
      }
    }
  };

  // Listen for instance removal
  const onInstanceRemoved = ({ instanceId }) => {
    if (ws.readyState === WebSocket.OPEN && isAlive) {
      try {
        ws.send(JSON.stringify({
          type: 'instanceRemoved',
          instanceId
        }));
      } catch (err) {
        console.error('[BaileysSocket] Error sending instance removal event:', err);
      }
    }
  };

  // Register event listeners
  baileysInstanceManager.on('qr', onQR);
  baileysInstanceManager.on('connectionUpdate', onConnectionUpdate);
  baileysInstanceManager.on('message', onMessage);
  baileysInstanceManager.on('instanceRemoved', onInstanceRemoved);

  // Handle incoming messages from client (if needed)
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      // Handle client messages if needed
      console.log('[BaileysSocket] Received message from client:', message);
    } catch (err) {
      console.error('[BaileysSocket] Error parsing message:', err);
    }
  });

  // Send a ping to keep connection alive
  pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.ping();
      } catch (err) {
        console.error('[BaileysSocket] Error sending ping:', err);
      }
    }
  }, 30000);

  // Handle disconnect
  ws.on('close', (code, reason) => {
    console.log('[BaileysSocket] Connection closed - Code:', code, 'Reason:', reason);
    isAlive = false;
    
    // Clean up rate limit tracking
    const clientData = connectionMap.get(clientIp);
    if (clientData && clientData.count > 0) {
      clientData.count--;
      if (clientData.count === 0) {
        connectionMap.delete(clientIp);
      }
    }
    
    if (pingInterval) {
      clearInterval(pingInterval);
    }
    // Remove event listeners
    baileysInstanceManager.off('qr', onQR);
    baileysInstanceManager.off('connectionUpdate', onConnectionUpdate);
    baileysInstanceManager.off('message', onMessage);
    baileysInstanceManager.off('instanceRemoved', onInstanceRemoved);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('[BaileysSocket] WebSocket error:', error);
    isAlive = false;
    if (pingInterval) {
      clearInterval(pingInterval);
    }
  });
}

module.exports = { setupBaileysSocketHandler };
