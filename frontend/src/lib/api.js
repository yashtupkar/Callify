const API_BASE = 'http://localhost:8083/api';

export const api = {
  getAgents: async () => {
    const res = await fetch(`${API_BASE}/agents`);
    if (!res.ok) throw new Error('Failed to fetch agents');
    return res.json();
  },
  
  getAgent: async (id) => {
    const res = await fetch(`${API_BASE}/agents/${id}`);
    if (!res.ok) throw new Error('Failed to fetch agent');
    return res.json();
  },

  createAgent: async (data) => {
    const res = await fetch(`${API_BASE}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create agent');
    return res.json();
  },

  updateAgent: async (id, data) => {
    const res = await fetch(`${API_BASE}/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update agent');
    return res.json();
  },

  getPhoneNumbers: async () => {
    const res = await fetch(`${API_BASE}/agents/phone-numbers`);
    if (!res.ok) throw new Error('Failed to fetch phone numbers');
    return res.json();
  },

  createPhoneNumber: async (data) => {
    const res = await fetch(`${API_BASE}/agents/phone-numbers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to add phone number');
    return res.json();
  },

  deletePhoneNumber: async (id) => {
    const res = await fetch(`${API_BASE}/agents/phone-numbers/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete phone number');
  }
};
