const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');

// Endpoint for SignalWire webhook when a call comes in
router.post('/incoming', async (req, res) => {
  try {
    const { To, From } = req.body;
    console.log(`[SignalWire] Incoming call from ${From} to ${To}`);

    // Look up the agent associated with this phone number
    const phoneNumber = await prisma.phoneNumber.findUnique({
      where: { phoneNumber: To },
      include: { agent: true }
    });

    if (!phoneNumber || !phoneNumber.agentId) {
      console.warn(`[SignalWire] No agent found for number ${To}`);
      // Fallback LāML (SignalWire's XML format, compatible with TwiML)
      const xml = `
        <Response>
          <Say>Sorry, this phone number is not configured correctly.</Say>
          <Reject />
        </Response>
      `;
      res.set('Content-Type', 'text/xml');
      return res.send(xml);
    }

    const host = req.headers.host;
    // Pass agentId in the WebSocket URL
    const wssUrl = `wss://${host}/?agentId=${phoneNumber.agentId}&protocol=signalwire`;

    // SignalWire LāML uses exactly the same syntax as Twilio TwiML for Streams
    const xml = `
      <Response>
        <Connect>
          <Stream url="${wssUrl}">
            <Parameter name="agentId" value="${phoneNumber.agentId}" />
          </Stream>
        </Connect>
      </Response>
    `;

    res.set('Content-Type', 'text/xml');
    res.send(xml);

  } catch (err) {
    console.error('[SignalWire] Error processing incoming call:', err);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
