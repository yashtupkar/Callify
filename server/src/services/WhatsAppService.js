const axios = require('axios');

class WhatsAppService {
  /**
   * Send a WhatsApp message using the Ultramsg API.
   * Requires ULTRAMSG_INSTANCE_ID and ULTRAMSG_TOKEN in .env
   * 
   * @param {string} toPhone - Recipient phone number (e.g. +14155552671)
   * @param {string} message - Text message content
   * @returns {Promise<boolean>}
   */
  static async sendMessage(toPhone, message) {
    const instanceId = process.env.ULTRAMSG_INSTANCE_ID;
    const token = process.env.ULTRAMSG_TOKEN;

    if (!instanceId || !token || instanceId === 'your_instance_id') {
      console.warn('[WhatsAppService] Missing or placeholder ULTRAMSG config in .env. Skipping actual WhatsApp send.');
      return false; // Not configured, acting as a mock
    }

    try {
      const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
      const data = new URLSearchParams({
        token: token,
        to: toPhone,
        body: message,
      });

      await axios.post(url, data.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      console.log(`[WhatsAppService] WhatsApp message successfully sent to ${toPhone}`);
      return true;
    } catch (error) {
      console.error('[WhatsAppService] Failed to send WhatsApp via Ultramsg:', error.response?.data || error.message);
      throw new Error('Failed to send WhatsApp message. Ensure your Ultramsg credentials are correct.');
    }
  }
}

module.exports = { WhatsAppService };
