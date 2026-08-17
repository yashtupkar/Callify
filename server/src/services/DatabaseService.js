const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

class DatabaseService {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    this.prisma = new PrismaClient({ adapter });
  }

  async saveSession(callSessionData) {
    try {
      const session = await this.prisma.callSession.create({
        data: callSessionData
      });
      console.log(`[DatabaseService] Session saved with ID: ${session.id}`);
      return session;
    } catch (err) {
      console.error('[DatabaseService] Failed to save session:', err);
    }
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }
}

// Export as singleton
const dbService = new DatabaseService();
module.exports = { dbService };
