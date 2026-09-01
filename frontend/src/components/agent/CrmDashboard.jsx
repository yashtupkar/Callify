import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, Calendar as CalendarIcon, Clock, Loader2 } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { Input } from '../ui/input';

const API_CRM = 'http://localhost:8083/api/crm';

export default function CrmDashboard({ agentId }) {
  const [activeTab, setActiveTab] = useState('contacts'); // 'contacts', 'bookings', 'availability'
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ contacts: [], bookings: [], availability: [] });

  useEffect(() => {
    if (!agentId) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [contacts, bookings, availability] = await Promise.all([
          axios.get(`${API_CRM}/agents/${agentId}/contacts`),
          axios.get(`${API_CRM}/agents/${agentId}/bookings?all=true`),
          axios.get(`${API_CRM}/agents/${agentId}/availability`),
        ]);
        setData({
          contacts: contacts.data,
          bookings: bookings.data,
          availability: availability.data
        });
      } catch (err) {
        console.error('Failed to load CRM data', err);
      }
      setLoading(false);
    };
    fetchData();
  }, [agentId, activeTab]);

  const saveAvailability = async (newAvailability) => {
    try {
      await axios.put(`${API_CRM}/agents/${agentId}/availability`, newAvailability);
      setData(prev => ({ ...prev, availability: newAvailability }));
    } catch (err) {
      console.error('Failed to save availability', err);
    }
  };

  if (!agentId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Select an agent to view their CRM
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background min-w-0">
      <div className="flex items-center px-6 py-4 border-b border-border bg-card">
        <h2 className="text-xl font-semibold flex-1">CRM Dashboard</h2>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-card px-4">
        <TabButton active={activeTab === 'contacts'} onClick={() => setActiveTab('contacts')} icon={<Users className="w-4 h-4 mr-2" />} label="Contacts" />
        <TabButton active={activeTab === 'bookings'} onClick={() => setActiveTab('bookings')} icon={<CalendarIcon className="w-4 h-4 mr-2" />} label="Bookings" />
        <TabButton active={activeTab === 'availability'} onClick={() => setActiveTab('availability')} icon={<Clock className="w-4 h-4 mr-2" />} label="Availability" />
      </div>

      <ScrollArea className="flex-1 p-6">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <>
            {activeTab === 'contacts' && <ContactsView contacts={data.contacts} />}
            {activeTab === 'bookings' && <BookingsView bookings={data.bookings} />}
            {activeTab === 'availability' && <AvailabilityView availability={data.availability} onSave={saveAvailability} />}
          </>
        )}
      </ScrollArea>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function ContactsView({ contacts }) {
  if (contacts.length === 0) return <div className="text-muted-foreground">No contacts yet.</div>;
  return (
    <div className="space-y-4">
      {contacts.map(c => (
        <div key={c.id} className="p-4 rounded-lg bg-card border border-border shadow-sm flex flex-col gap-1">
          <div className="font-medium text-lg">{c.name || 'Unknown'}</div>
          {c.phone && <div className="text-sm text-zinc-400">Phone: {c.phone}</div>}
          {c.email && <div className="text-sm text-zinc-400">Email: {c.email}</div>}
          <div className="text-xs text-zinc-500 mt-2">Saved: {new Date(c.createdAt).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

function BookingsView({ bookings }) {
  if (bookings.length === 0) return <div className="text-muted-foreground">No bookings yet.</div>;
  return (
    <div className="space-y-4">
      {bookings.map(b => {
        const isCancelled = b.status === 'cancelled';
        const isRescheduled = b.status === 'rescheduled';
        return (
          <div key={b.id} className={`p-4 rounded-lg border shadow-sm flex flex-col gap-1 ${isCancelled ? 'bg-red-950/20 border-red-800/40 opacity-70' : 'bg-card border-border'}`}>
            <div className={`font-medium text-lg ${isCancelled ? 'line-through text-zinc-500' : ''}`}>
              {new Date(b.startTime).toLocaleString()} &mdash; {new Date(b.endTime).toLocaleTimeString()}
            </div>
            <div className="text-sm text-zinc-300">Client: {b.contact?.name || 'Unknown'}</div>
            {b.contact?.phone && <div className="text-xs text-zinc-500">Phone: {b.contact.phone}</div>}
            <div className="text-xs mt-1">
              Status:{' '}
              <span className={`uppercase font-semibold ${isCancelled ? 'text-red-400' : 'text-green-400'}`}>
                {b.status}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AvailabilityView({ availability, onSave }) {
  const defaultSchedule = Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    startTime: '09:00',
    endTime: '17:00',
    isActive: i > 0 && i < 6 // Mon-Fri active by default
  }));

  const [schedule, setSchedule] = useState(
    availability.length === 7 ? availability : defaultSchedule
  );

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const handleToggle = (i) => {
    const newSched = [...schedule];
    newSched[i].isActive = !newSched[i].isActive;
    setSchedule(newSched);
  };

  const handleChange = (i, field, val) => {
    const newSched = [...schedule];
    newSched[i][field] = val;
    setSchedule(newSched);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {schedule.map((day, i) => (
          <div key={i} className="flex items-center gap-4 bg-card p-3 border border-border rounded-lg">
            <label className="flex items-center gap-2 w-32 cursor-pointer">
              <input type="checkbox" checked={day.isActive} onChange={() => handleToggle(i)} className="rounded bg-black/50 border-white/20" />
              <span className={day.isActive ? "text-foreground" : "text-muted-foreground"}>{days[i]}</span>
            </label>
            {day.isActive ? (
              <div className="flex items-center gap-2">
                <Input type="time" value={day.startTime} onChange={e => handleChange(i, 'startTime', e.target.value)} className="w-32 bg-background" />
                <span className="text-muted-foreground">to</span>
                <Input type="time" value={day.endTime} onChange={e => handleChange(i, 'endTime', e.target.value)} className="w-32 bg-background" />
              </div>
            ) : (
              <span className="text-zinc-600 italic">Unavailable</span>
            )}
          </div>
        ))}
      </div>
      <button onClick={() => onSave(schedule)} className="px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90">
        Save Schedule
      </button>
    </div>
  );
}
