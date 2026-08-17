import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Phone, Link2, Plus, Trash2 } from 'lucide-react';

export function PhoneNumbers() {
  const [numbers, setNumbers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Add number state
  const [newNumber, setNewNumber] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [numsData, agentsData] = await Promise.all([
        api.getPhoneNumbers(),
        api.getAgents()
      ]);
      setNumbers(numsData);
      setAgents(agentsData);
      if (agentsData.length > 0) {
        setSelectedAgentId(agentsData[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newNumber || !selectedAgentId) return;
    
    try {
      setAdding(true);
      await api.createPhoneNumber({
        phoneNumber: newNumber,
        agentId: selectedAgentId
      });
      setNewNumber('');
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this mapping?')) return;
    try {
      await api.deletePhoneNumber(id);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-auto p-6 max-w-[1000px] w-full mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Phone Numbers</h1>
          <p className="text-muted-foreground mt-1">Map your Twilio or SignalWire numbers to Agents</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 mb-8">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Link2 size={18} />
          Link New Number
        </h3>
        <form onSubmit={handleAdd} className="flex gap-4 items-end">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-foreground">Phone Number (E.164 format)</label>
            <input 
              type="text" 
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              placeholder="+13159734981"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-foreground">Assign to Agent</label>
            <select 
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <button 
            type="submit"
            disabled={adding || !newNumber}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Plus size={16} />
            {adding ? 'Linking...' : 'Link'}
          </button>
        </form>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted/20">
          <h3 className="font-semibold text-foreground">Active Numbers</h3>
        </div>
        
        {loading ? (
          <div className="p-6 text-center text-muted-foreground">Loading...</div>
        ) : numbers.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Phone size={32} className="mx-auto mb-3 opacity-30" />
            No phone numbers mapped yet.
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/10 border-b border-border">
              <tr>
                <th className="px-6 py-3 font-medium text-muted-foreground">Number</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Agent</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {numbers.map(num => (
                <tr key={num.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                  <td className="px-6 py-4 font-mono">{num.phoneNumber}</td>
                  <td className="px-6 py-4">{num.agent?.name || 'Unknown'}</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleDelete(num.id)}
                      className="text-red-500 hover:text-red-600 p-1 rounded hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
