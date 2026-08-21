const BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listAgents: () => request('/api/agents'),
  getAgent: (id) => request(`/api/agents/${id}`),
  createAgent: (data) => request('/api/agents', { method: 'POST', body: JSON.stringify(data) }),
  updateAgent: (id, data) => request(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAgent: (id) => request(`/api/agents/${id}`, { method: 'DELETE' }),
  listToolTypes: () => request('/api/tools'),
};

export function wsUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}
