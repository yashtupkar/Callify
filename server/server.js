require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { setupConnectionHandler } = require('./src/socket/connectionHandler');
const { setupTelnyxConnectionHandler } = require('./src/socket/telnyxConnectionHandler');
const { setupBaileysSocketHandler } = require('./src/socket/baileysSocket');
const { routes: whatsappAutomationRouter, WhatsAppAutomationInboundRouter, initializeWhatsAppAutomationProviders } = require('./src/whatsappAutomation');
const { RateLimiter } = require('./src/whatsappAutomation/concurrency');
const app = express();
// CORS_ORIGINS=https://app.example.com,https://admin.example.com restricts browser origins; unset reflects any origin (dev only)
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true, credentials: true }));

const webhookLimiter = new RateLimiter({
  limit: Number(process.env.WEBHOOK_RATE_LIMIT || 600),
  windowMs: Number(process.env.WEBHOOK_RATE_WINDOW_MS || 60000),
});
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

// Capture raw body for Meta signature verification on the WhatsApp webhook (POST only)
app.use((req, res, next) => {
  if ((req.path.startsWith('/api/whatsapp-automation/webhook') || req.path.startsWith('/api/whatsapp/webhook')) && req.method === 'POST') {
    if (!webhookLimiter.allow(req.ip)) return res.status(429).send('Too many requests');
    let data = '';
    let size = 0;
    req.setEncoding('utf8');
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_WEBHOOK_BODY_BYTES) {
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      req.rawBody = data;
      try { req.body = data ? JSON.parse(data) : {}; } catch (e) { req.body = {}; }
      next();
    });
  } else {
    next();
  }
});
const campaigns = require('./src/campaigns');
// Mounted before the global 100kb JSON parser: campaign uploads carry parsed spreadsheet rows (own 5mb limit)
app.use('/api/campaigns', campaigns.buildRouter());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// WhatsApp automation public webhooks (MUST be mounted before auth-protected routers)
app.all('/api/whatsapp-automation/webhook', (req, res) => WhatsAppAutomationInboundRouter.handle(req, res));
app.all('/api/whatsapp-automation/webhook/:connectionId', (req, res) => WhatsAppAutomationInboundRouter.handle(req, res));
app.all('/api/whatsapp/webhook', (req, res) => WhatsAppAutomationInboundRouter.handle(req, res));

const path = require('path');
app.use(express.static(path.join(__dirname, '../client')));

const agentsRouter = require('./src/routes/agents');
app.use('/api/agents', agentsRouter);

const phoneNumbersRouter = require('./src/routes/phoneNumbers');
app.use('/api/phonenumbers', phoneNumbersRouter);

const crmRouter = require('./src/routes/crm');
app.use('/api/crm', crmRouter);

const authRouter = require('./src/routes/auth');
app.use('/api/auth', authRouter);

app.use('/api/whatsapp-automation', whatsappAutomationRouter);

const baileysRouter = require('./src/routes/baileys');
app.use('/api/baileys', baileysRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'realtime-voice-service' });
});

// Telnyx TeXML Webhook to Answer Call and Start Stream
app.post('/api/telnyx/webhook', (req, res) => {
  // In production, set SERVER_URL in your .env file
  // For local testing, it should be your ngrok domain (e.g. your-id.ngrok-free.app)
  const serverUrl = process.env.SERVER_URL || req.get('host');
  
  // TeXML sends the dialed number in the 'To' field
  const to = req.body.To || '';
  const toQuery = to ? `?to=${encodeURIComponent(to)}` : '';
  
  const texml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${serverUrl}/telnyx-media${toQuery}" track="inbound_track" bidirectionalMode="rtp" bidirectionalCodec="PCMU" />
  </Connect>
</Response>`;

  res.type('application/xml');
  res.send(texml);
});

const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log(`[Server] New WebSocket connection established on path: ${req.url}`);

  // Parse URL to handle query parameters
  const urlParts = req.url.split('?');
  const pathname = urlParts[0];
  const queryParams = new URLSearchParams(urlParts[1] || '');

  if (pathname === '/telnyx-media') {
    const to = queryParams.get('to');
    setupTelnyxConnectionHandler(ws, req, to);
  } else if (pathname === '/baileys') {
    setupBaileysSocketHandler(ws, req);
  } else {
    setupConnectionHandler(ws, req);
  }
});

const PORT = process.env.VOICE_PORT || 8083;
server.listen(PORT, () => {
  console.log(`Realtime Voice Service running on http://localhost:${PORT}`);
  console.log(`WebSocket server listening on ws://localhost:${PORT}`);
  initializeWhatsAppAutomationProviders().catch(error => {
    console.error('[WhatsAppAutomation] Startup initialization failed:', error);
  });
  campaigns.startWorker();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    campaigns.stopWorker().finally(() => process.exit(0));
  });
}
