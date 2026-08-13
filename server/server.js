require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { setupConnectionHandler } = require('./src/socket/connectionHandler');

const app = express();
app.use(cors());
app.use(express.json());

const path = require('path');
app.use(express.static(path.join(__dirname, '../client')));

const apiRoutes = require('./src/routes/apiRoutes');
app.use('/api/agents', apiRoutes);

const twilioRoutes = require('./src/routes/twilioRoutes');
// Twilio sends data as application/x-www-form-urlencoded
app.use('/api/twilio', express.urlencoded({ extended: true }), twilioRoutes);

const signalwireRoutes = require('./src/routes/signalwireRoutes');
// SignalWire also sends data as application/x-www-form-urlencoded
app.use('/api/signalwire', express.urlencoded({ extended: true }), signalwireRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'realtime-voice-service' });
});

const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log('[Server] New WebSocket connection established.');
  setupConnectionHandler(ws, req);
});

const PORT = process.env.VOICE_PORT || 8083;
server.listen(PORT, () => {
  console.log(`Realtime Voice Service running on http://localhost:${PORT}`);
  console.log(`WebSocket server listening on ws://localhost:${PORT}`);
});
