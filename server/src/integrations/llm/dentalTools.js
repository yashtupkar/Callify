const mockAppointments = [
  { id: 1, name: "John Doe", time: "2026-08-17T10:00:00Z" },
  { id: 2, name: "Jane Smith", time: "2026-08-17T14:30:00Z" }
];

const dentalTools = [
  {
    type: "function",
    function: {
      name: "book_appointment",
      description: "Book a new dental appointment for a patient.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The full name of the patient."
          },
          time: {
            type: "string",
            description: "The requested time for the appointment in ISO format."
          }
        },
        required: ["name", "time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "check_availability",
      description: "Check if a specific time slot is available for an appointment. IMPORTANT: NEVER book an appointment immediately after checking availability. You MUST ALWAYS tell the user if it's available and ask for their explicit confirmation before booking.",
      parameters: {
        type: "object",
        properties: {
          time: {
            type: "string",
            description: "The requested time to check in ISO format."
          }
        },
        required: ["time"]
      }
    }
  }
];

function executeDentalTool(toolName, args) {
  if (toolName === "book_appointment") {
    console.log(`[MockDB] Booking appointment for ${args.name} at ${args.time}`);
    mockAppointments.push({ id: mockAppointments.length + 1, name: args.name, time: args.time });
    return { success: true, message: `Appointment booked for ${args.name} at ${args.time}` };
  } else if (toolName === "check_availability") {
    const isBooked = mockAppointments.some(a => a.time === args.time);
    console.log(`[MockDB] Checking availability for ${args.time}. Booked: ${isBooked}`);
    if (isBooked) {
      return { available: false, message: `The time slot ${args.time} is already booked.` };
    }
    return { available: true, message: `The time slot ${args.time} is available.` };
  }
  return { error: `Tool ${toolName} not found.` };
}

module.exports = { dentalTools, executeDentalTool };
