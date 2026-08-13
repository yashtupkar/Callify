require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');
  
  // 1. Create a dynamic agent
  const agent = await prisma.agent.create({
    data: {
      name: "Dental Receptionist",
      systemPrompt: "You are a friendly and professional dental clinic receptionist. You can help users check availability and book dental appointments. Always use the provided tools to check availability and book appointments when requested. Keep your answers brief and natural.",
      initialMessage: "Hi, thanks for calling the dental clinic! How can I help you today?",
      // Adding our default tool schemas as a JSON object
      tools: [
        {
          type: "function",
          function: {
            name: "book_appointment",
            description: "Book a new dental appointment for a patient.",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "The full name of the patient." },
                time: { type: "string", description: "The time of the appointment in ISO format." }
              },
              required: ["name", "time"]
            }
          }
        }
      ]
    }
  });

  console.log(`✅ Created Agent: ${agent.name} with ID: ${agent.id}`);

  // 2. Link the SignalWire phone number to this agent
  // Make sure this matches EXACTLY what SignalWire sends (usually starts with +)
  const phone = await prisma.phoneNumber.create({
    data: {
      phoneNumber: "+13159734981", 
      agentId: agent.id
    }
  });

  console.log(`✅ Linked Phone Number: ${phone.phoneNumber} to Agent ID: ${agent.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
