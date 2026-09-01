const axios = require('axios');

class EmailService {
  /**
   * Send an email using the Brevo (Sendinblue) transactional REST API.
   * Requires BREVO_API_KEY, BREVO_SENDER_EMAIL, and optionally BREVO_SENDER_NAME in .env
   * 
   * @param {string} toEmail - Recipient email address
   * @param {string} subject - Email subject
   * @param {string} textContent - Plain text content
   * @param {string} htmlContent - HTML content (optional)
   * @returns {Promise<boolean>}
   */
  static async sendEmail(toEmail, subject, textContent, htmlContent = '') {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME || 'Callify Agent';

    if (!apiKey || !senderEmail) {
      console.warn('[EmailService] Missing BREVO_API_KEY or BREVO_SENDER_EMAIL in .env. Skipping actual email send.');
      return false; // Not configured, acting as a mock
    }

    try {
      const payload = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail }],
        subject: subject,
        textContent: textContent,
      };

      if (htmlContent) {
        payload.htmlContent = htmlContent;
      }

      await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
        headers: {
          'accept': 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json'
        }
      });

      console.log(`[EmailService] Email successfully sent to ${toEmail}`);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send email via Brevo:', error.response?.data || error.message);
      throw new Error('Failed to send email. Ensure the Brevo API key is correct.');
    }
  }
}

module.exports = { EmailService };
