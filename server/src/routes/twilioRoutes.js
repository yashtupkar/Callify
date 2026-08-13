const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');

// Endpoint for Twilio webhook when a call comes in
router.post('/incoming', async (req, res) => {
  try {
    const { To, From } = req.body;
    console.log(`[Twilio] Incoming call from ${From} to ${To}`);

    // Look up the agent associated with this phone number
    const phoneNumber = await prisma.phoneNumber.findUnique({
      where: { phoneNumber: To },
      include: { agent: true }
    });

    if (!phoneNumber || !phoneNumber.agentId) {
      console.warn(`[Twilio] No agent found for number ${To}`);
      // Fallback TwiML
      const twiml = `
        <Response>
          <Say>Sorry, this phone number is not configured correctly.</Say>
          <Reject />
        </Response>
      `;
      res.set('Content-Type', 'text/xml');
      return res.send(twiml);
    }

    const host = req.headers.host;
    // We pass the agentId in the WebSocket URL so the connection handler knows which agent config to load
    const wssUrl = `wss://${host}/?agentId=${phoneNumber.agentId}&protocol=twilio`;

    const twiml = `
      <Response>
        <Connect>
          <Stream url="${wssUrl}">
            <Parameter name="agentId" value="${phoneNumber.agentId}" />
          </Stream>
        </Connect>
      </Response>
    `;

    res.set('Content-Type', 'text/xml');
    res.send(twiml);

  } catch (err) {
    console.error('[Twilio] Error processing incoming call:', err);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
