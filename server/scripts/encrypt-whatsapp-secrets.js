// One-off: encrypts plaintext apiToken/appSecret columns of WhatsAppConnection.
// Usage: WHATSAPP_SECRETS_KEY=<64 hex chars> node scripts/encrypt-whatsapp-secrets.js
require('dotenv').config();
const { dbService } = require('../src/services/DatabaseService');
const { encryptConnectionSecrets, isEncrypted, SECRET_FIELDS } = require('../src/whatsappAutomation/secretBox');

(async () => {
  if (!process.env.WHATSAPP_SECRETS_KEY) throw new Error('WHATSAPP_SECRETS_KEY is required');
  const rows = await dbService.prisma.whatsAppConnection.findMany({ select: { id: true, apiToken: true, appSecret: true } });
  let updated = 0;
  for (const row of rows) {
    const pending = SECRET_FIELDS.filter((field) => row[field] && !isEncrypted(row[field]));
    if (!pending.length) continue;
    const data = encryptConnectionSecrets(Object.fromEntries(pending.map((field) => [field, row[field]])));
    await dbService.prisma.whatsAppConnection.update({ where: { id: row.id }, data });
    updated += 1;
  }
  console.log(`Encrypted secrets on ${updated} of ${rows.length} connection(s)`);
  process.exit(0);
})().catch((err) => { console.error(err.message); process.exit(1); });