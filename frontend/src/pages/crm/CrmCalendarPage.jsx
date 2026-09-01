import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  parseISO,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalIcon,
  Clock,
  User,
  Loader2,
  Bot,
  ExternalLink,
  LayoutGrid,
  List,
  CalendarDays,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/data-badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SERVER_URL } from '@/lib/constants';
import { cn } from '@/lib/utils';

const STATUS_PALETTE = {
  confirmed: { bar: 'bg-emerald-500', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-500' },
  scheduled: { bar: 'bg-blue-500',    chip: 'bg-blue-500/15 text-blue-300 border-blue-500/30',             dot: 'bg-blue-500' },
  rescheduled:{ bar: 'bg-violet-500', chip: 'bg-violet-500/15 text-violet-300 border-violet-500/30',       dot: 'bg-violet-500' },
  cancelled:  { bar: 'bg-red-500',    chip: 'bg-red-500/15 text-red-300 border-red-500/30',                dot: 'bg-red-500' },
  pending:    { bar: 'bg-amber-500',  chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30',          dot: 'bg-amber-500' },
};
const DEFAULT_PALETTE = { bar: 'bg-indigo-500', chip: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30', dot: 'bg-indigo-500' };

function paletteFor(booking) {
  const status = (booking.status || 'confirmed').toLowerCase();
  return STATUS_PALETTE[status] || DEFAULT_PALETTE;
}

// Hash the agentId to a hue for varied chip colors when status is generic
function agentAccent(agentId) {
  if (!agentId) return DEFAULT_PALETTE;
  const colors = [
    { bar: 'bg-indigo-500',  chip: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',   dot: 'bg-indigo-500' },
    { bar: 'bg-sky-500',     chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30',             dot: 'bg-sky-500' },
    { bar: 'bg-violet-500',  chip: 'bg-violet-500/15 text-violet-300 border-violet-500/30',   dot: 'bg-violet-500' },
    { bar: 'bg-pink-500',    chip: 'bg-pink-500/15 text-pink-300 border-pink-500/30',         dot: 'bg-pink-500' },
    { bar: 'bg-amber-500',   chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30',      dot: 'bg-amber-500' },
    { bar: 'bg-teal-500',    chip: 'bg-teal-500/15 text-teal-300 border-teal-500/30',         dot: 'bg-teal-500' },
  ];
  let h = 0;
  for (let i = 0; i < agentId.length; i++) h = (h * 31 + agentId.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

export default function CrmCalendarPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(new Date());
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [view, setView] = useState('month');

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await axios.get(`${SERVER_URL}/api/crm/my-agents`);
        setAgents(res.data);
      } catch (err) { console.error(err); }
    };
    fetchAgents();
  }, []);

  useEffect(() => {
    const fetchBookings = async () => {
      setLoading(true);
      try {
        const all = [];
        const sources = selectedAgent === 'all'
          ? agents
          : agents.filter(a => a.id === selectedAgent);
        for (const agent of sources) {
          try {
            const res = await axios.get(`${SERVER_URL}/api/crm/agents/${agent.id}/bookings?all=true`);
            for (const b of res.data) all.push({ ...b, agentName: agent.name, agentId: agent.id });
          } catch {}
        }
        setBookings(all);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (agents.length > 0) fetchBookings();
  }, [selectedAgent, agents]);

  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const monthDays = useMemo(() => {
    const days = [];
    let d = gridStart;
    while (d <= gridEnd) { days.push(d); d = addDays(d, 1); }
    return days;
  }, [gridStart, gridEnd]);

  const bookingsByDay = useMemo(() => {
    const map = new Map();
    for (const b of bookings) {
      const key = format(new Date(b.startTime), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(b);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    }
    return map;
  }, [bookings]);

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const selectedKey = format(date, 'yyyy-MM-dd');
  const dayBookings = bookingsByDay.get(selectedKey) || [];

  // Agenda view = next 7 days from today
  const agendaDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) days.push(addDays(new Date(), i));
    return days;
  }, []);

  return (
    <div className="space-y-4">
      {/* Header / controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground mt-1 text-sm">Plot bookings across time</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <Tabs value={view} onValueChange={setView}>
            <TabsList>
              <TabsTrigger value="month" className="gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5" /> Month
              </TabsTrigger>
              <TabsTrigger value="agenda" className="gap-1.5">
                <List className="w-3.5 h-3.5" /> Agenda
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDate(subMonths(date, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setDate(new Date())}>Today</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDate(addMonths(date, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <h2 className="text-lg font-semibold ml-3">{format(date, 'MMMM yyyy')}</h2>
          </div>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>

        {view === 'month' ? (
          <MonthView
            monthDays={monthDays}
            monthStart={monthStart}
            bookingsByDay={bookingsByDay}
            todayKey={todayKey}
            selectedKey={selectedKey}
            onSelectDay={(d) => setDate(d)}
          />
        ) : (
          <AgendaView
            days={agendaDays}
            bookingsByDay={bookingsByDay}
          />
        )}
      </Card>

      {view === 'month' && (
        <DayDetailPanel
          date={date}
          bookings={dayBookings}
          onOpenAgent={(id) => navigate(`/crm/agent/${id}`)}
        />
      )}
    </div>
  );
}

/* ───────────────────────────── Month grid ───────────────────────────── */

function MonthView({ monthDays, monthStart, bookingsByDay, todayKey, selectedKey, onSelectDay }) {
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return (
    <div className="grid grid-cols-7 border-b border-border bg-muted/20">
      {weekdayLabels.map(d => (
        <div key={d} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-r border-border last:border-r-0">
          {d}
        </div>
      ))}
      {monthDays.map((d, i) => {
        const key = format(d, 'yyyy-MM-dd');
        const dayBookings = bookingsByDay.get(key) || [];
        const inMonth = isSameMonth(d, monthStart);
        const isToday = key === todayKey;
        const isSelected = key === selectedKey;
        return (
          <button
            key={i}
            onClick={() => onSelectDay(d)}
            className={cn(
              'min-h-[112px] text-left p-2 border-r border-b border-border last:border-r-0 transition-colors flex flex-col gap-1 group',
              inMonth ? 'bg-card' : 'bg-muted/10 text-muted-foreground/60',
              isSelected ? 'ring-2 ring-primary ring-inset' : 'hover:bg-muted/30'
            )}
          >
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  'inline-flex items-center justify-center text-xs font-semibold h-6 w-6 rounded-full',
                  isToday && 'bg-primary text-primary-foreground',
                  !isToday && inMonth && 'text-foreground',
                  !isToday && !inMonth && 'text-muted-foreground/50'
                )}
              >
                {format(d, 'd')}
              </span>
              {dayBookings.length > 0 && !isToday && (
                <span className="text-[10px] text-muted-foreground">{dayBookings.length}</span>
              )}
            </div>
            <div className="flex flex-col gap-1 overflow-hidden">
              {dayBookings.slice(0, 3).map((b, idx) => {
                const p = paletteFor(b);
                return (
                  <div
                    key={b.id || idx}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] truncate',
                      p.chip
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', p.dot)} />
                    <span className="font-mono opacity-80 shrink-0">
                      {format(new Date(b.startTime), 'HH:mm')}
                    </span>
                    <span className="truncate font-medium">
                      {b.contact?.name || 'Unknown'}
                    </span>
                  </div>
                );
              })}
              {dayBookings.length > 3 && (
                <div className="text-[10px] text-muted-foreground pl-1">
                  +{dayBookings.length - 3} more
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── Day detail ───────────────────────────── */

function DayDetailPanel({ date, bookings, onOpenAgent }) {
  const total = bookings.length;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-0">
      <div className="p-5 border-r border-border">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-semibold">{format(date, 'EEEE, MMMM d')}</h3>
          {total > 0 && <Badge tone="primary" className="font-mono">{total}</Badge>}
        </div>
        {bookings.length === 0 ? (
          <div className="text-sm text-muted-foreground italic py-8 text-center">
            No bookings scheduled
          </div>
        ) : (
          <div className="space-y-2">
            {bookings.map(b => <BookingRow key={b.id} booking={b} onOpenAgent={onOpenAgent} />)}
          </div>
        )}
      </div>
      <div className="p-5 bg-muted/10">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
          <CalendarDays className="w-4 h-4" /> Color legend
        </h4>
        <div className="space-y-2 text-xs">
          <LegendRow color="bg-emerald-500" label="Confirmed" />
          <LegendRow color="bg-blue-500" label="Scheduled" />
          <LegendRow color="bg-violet-500" label="Rescheduled" />
          <LegendRow color="bg-amber-500" label="Pending" />
          <LegendRow color="bg-red-500" label="Cancelled" />
        </div>
        <div className="mt-5 pt-5 border-t border-border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Click a day on the grid to see its bookings here. Click an event to open the agent.
          </p>
        </div>
      </div>
    </div>
  );
}

function LegendRow({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('h-2.5 w-2.5 rounded-full', color)} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function BookingRow({ booking, onOpenAgent }) {
  const p = paletteFor(booking);
  const start = new Date(booking.startTime);
  const end = new Date(booking.endTime);
  const mins = Math.max(1, Math.round((end - start) / 60000));
  return (
    <div className="group flex items-stretch gap-3 rounded-lg border border-border bg-card hover:border-primary/40 transition-colors">
      <div className={cn('w-1.5 rounded-l-lg shrink-0', p.bar)} />
      <div className="flex-1 p-3 flex items-center justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={cn('font-semibold text-sm', (booking.status || '').toLowerCase() === 'cancelled' && 'line-through opacity-60')}>
              {booking.contact?.name || 'Unknown'}
            </p>
            <Badge tone={STATUS_TONE_FOR(booking.status)} dot className="capitalize">{booking.status || 'confirmed'}</Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5 flex-wrap">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
            </span>
            <span className="text-muted-foreground/60">·</span>
            <span>{mins} min</span>
            {booking.contact?.phone && (
              <>
                <span className="text-muted-foreground/60">·</span>
                <span className="flex items-center gap-1"><User className="w-3 h-3" />{booking.contact.phone}</span>
              </>
            )}
            {booking.agentName && (
              <>
                <span className="text-muted-foreground/60">·</span>
                <span className="flex items-center gap-1"><Bot className="w-3 h-3" />{booking.agentName}</span>
              </>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="opacity-60 group-hover:opacity-100 transition-opacity"
          onClick={() => onOpenAgent(booking.agentId)}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function STATUS_TONE_FOR(s) {
  const v = (s || 'confirmed').toLowerCase();
  if (v === 'cancelled') return 'red';
  if (v === 'rescheduled') return 'violet';
  if (v === 'pending') return 'amber';
  if (v === 'scheduled') return 'blue';
  return 'emerald';
}

/* ───────────────────────────── Agenda view ───────────────────────────── */

function AgendaView({ days, bookingsByDay }) {
  let totalShown = 0;
  return (
    <div className="divide-y divide-border">
      {days.map(d => {
        const key = format(d, 'yyyy-MM-dd');
        const list = bookingsByDay.get(key) || [];
        totalShown += list.length;
        const isToday = isSameDay(d, new Date());
        return (
          <div key={key} className="px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <div className={cn(
                'flex flex-col items-center justify-center h-12 w-12 rounded-lg border',
                isToday ? 'border-primary bg-primary/10' : 'border-border bg-muted/30'
              )}>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{format(d, 'EEE')}</span>
                <span className="text-lg font-bold leading-none">{format(d, 'd')}</span>
              </div>
              <div>
                <p className="font-semibold">{format(d, 'EEEE, MMMM d')}</p>
                <p className="text-xs text-muted-foreground">
                  {list.length} {list.length === 1 ? 'booking' : 'bookings'}
                </p>
              </div>
            </div>
            {list.length === 0 ? (
              <div className="text-xs text-muted-foreground italic pl-14">No bookings</div>
            ) : (
              <div className="space-y-2 pl-14">
                {list.map(b => <BookingRow key={b.id} booking={b} />)}
              </div>
            )}
          </div>
        );
      })}
      {totalShown === 0 && (
        <div className="px-4 py-16 text-center text-muted-foreground">
          <CalIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No upcoming bookings in the next 7 days</p>
        </div>
      )}
    </div>
  );
}
