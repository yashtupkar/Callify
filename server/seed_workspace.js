const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Migrating data to default workspace...');
  
  // 1. Find or create default workspace
  let defaultWorkspace = await prisma.workspace.findFirst({
    where: { name: 'Default Workspace' }
  });
  
  if (!defaultWorkspace) {
    defaultWorkspace = await prisma.workspace.create({
      data: { name: 'Default Workspace' }
    });
    console.log(`Created Default Workspace: ${defaultWorkspace.id}`);
  } else {
    console.log(`Found Default Workspace: ${defaultWorkspace.id}`);
  }

  // 2. Update Agents
  const agentsRes = await prisma.agent.updateMany({
    where: { workspaceId: null },
    data: { workspaceId: defaultWorkspace.id, type: 'general' }
  });
  console.log(`Updated ${agentsRes.count} agents`);

  // 3. Update Phone Numbers
  const phonesRes = await prisma.phoneNumber.updateMany({
    where: { workspaceId: null },
    data: { workspaceId: defaultWorkspace.id }
  });
  console.log(`Updated ${phonesRes.count} phone numbers`);

  // 4. Update Call Sessions
  const sessionsRes = await prisma.callSession.updateMany({
    where: { workspaceId: null },
    data: { workspaceId: defaultWorkspace.id }
  });
  console.log(`Updated ${sessionsRes.count} call sessions`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
