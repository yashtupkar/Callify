require('dotenv').config();
const { EmailService } = require('./src/services/EmailService');
const { WhatsAppService } = require('./src/services/WhatsAppService');

// ==========================================
// CONFIGURATION
// Replace these with your actual test details
// ==========================================
const TEST_EMAIL = "yashtupkar44@example.com";   // <-- Put your email here
const TEST_PHONE = "+917898297769";           // <-- Put your WhatsApp number here (include country code)

async function testServices() {
  console.log("=========================================");
  console.log("🚀 Testing Messaging Services...");
  console.log("=========================================\n");

  // 1. Test Email (Brevo)
  console.log("📧 1. Testing EmailService (Brevo)...");
  if (!process.env.BREVO_API_KEY) {
    console.log("❌ Skipping Email: BREVO_API_KEY is not set in .env");
  } else if (TEST_EMAIL === "your_email@example.com") {
    console.log("⚠️  Skipping Email: Please update TEST_EMAIL in this script to a real email address.");
  } else {
    try {
      const subject = "Test from Callify Agent Builder";
      const text = "Hello! This is a test email sent from the Callify EmailService using Brevo.";
      const success = await EmailService.sendEmail(TEST_EMAIL, subject, text);
      if (success) {
        console.log(`✅ Success! Email sent to ${TEST_EMAIL}`);
      } else {
        console.log("⚠️  EmailService returned false (Mock Mode). Check .env variables.");
      }
    } catch (err) {
      console.log("❌ Failed to send email:");
      console.error(err.message);
    }
  }

  console.log("\n-----------------------------------------\n");

  // 2. Test WhatsApp (Ultramsg)
  console.log("💬 2. Testing WhatsAppService (Ultramsg)...");
  if (!process.env.ULTRAMSG_INSTANCE_ID || process.env.ULTRAMSG_INSTANCE_ID === 'your_instance_id') {
    console.log("❌ Skipping WhatsApp: ULTRAMSG_INSTANCE_ID is not configured in .env");
  } else if (TEST_PHONE === "+14155552671") {
    console.log("⚠️  Skipping WhatsApp: Please update TEST_PHONE in this script to your real WhatsApp number.");
  } else {
    try {
      const message = "Hello! This is a test WhatsApp message sent from the Callify WhatsAppService using Ultramsg.";
      const success = await WhatsAppService.sendMessage(TEST_PHONE, message);
      if (success) {
        console.log(`✅ Success! WhatsApp message sent to ${TEST_PHONE}`);
      } else {
        console.log("⚠️  WhatsAppService returned false (Mock Mode). Check .env variables.");
      }
    } catch (err) {
      console.log("❌ Failed to send WhatsApp message:");
      console.error(err.message);
    }
  }

  console.log("\n=========================================");
  console.log("🏁 Test Complete!");
  console.log("=========================================\n");
}

testServices();
