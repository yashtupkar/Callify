require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { setupConnectionHandler } = require('./src/socket/connectionHandler');
const { setupTelnyxConnectionHandler } = require('./src/socket/telnyxConnectionHandler');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend testing files from the client folder
const path = require('path');
app.use(express.static(path.join(__dirname, '../client')));

const agentsRouter = require('./src/routes/agents');
app.use('/api/agents', agentsRouter);

const phoneNumbersRouter = require('./src/routes/phoneNumbers');
app.use('/api/phonenumbers', phoneNumbersRouter);

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
  } else {
    setupConnectionHandler(ws, req);
  }
});

const PORT = process.env.VOICE_PORT || 8083;
server.listen(PORT, () => {
  console.log(`Realtime Voice Service running on http://localhost:${PORT}`);
  console.log(`WebSocket server listening on ws://localhost:${PORT}`);
});
