const axios = require('axios');

async function testWebhook() {
  const baseUrl = 'http://localhost:8083';

  console.log('1. Testing GET Webhook challenge verification...');
  try {
    const res = await axios.get(`${baseUrl}/api/whatsapp-automation/webhook`, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'callify_webhook_token',
        'hub.challenge': '1158201444',
      },
    });
    console.log('Verification Response Status:', res.status);
    console.log('Verification Response Body:', res.data);
  } catch (err) {
    console.error('Verification failed:', err.response?.data || err.message);
  }

  console.log('\n2. Testing POST Inbound Message structure...');
  const mockPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '109823485723412',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550123456',
                phone_number_id: '104829384812345',
              },
              contacts: [
                {
                  profile: { name: 'Alice' },
                  wa_id: '15559876543',
                },
              ],
              messages: [
                {
                  from: '15559876543',
                  id: 'wamid.HBgLMTU1NTk4NzY1NDMVAgARGBIwM0M5MEQ5MzM2OTczQ0ExNgA=',
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  text: { body: 'Hello! What services do you offer?' },
                  type: 'text',
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };

  try {
    const res = await axios.post(`${baseUrl}/api/whatsapp-automation/webhook`, mockPayload);
    console.log('Inbound Webhook POST Response Status:', res.status);
    console.log('Inbound Webhook POST Response Body:', res.data);
  } catch (err) {
    console.error('Inbound message test failed:', err.response?.data || err.message);
  }
}

testWebhook();
