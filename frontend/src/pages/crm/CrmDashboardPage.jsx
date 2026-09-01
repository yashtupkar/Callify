import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  Users,
  PhoneCall,
  Calendar,
  TrendingUp,
  Bot,
  Loader2,
  ArrowRight
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/data-badge';
import { Button } from '@/components/ui/button';
import { SERVER_URL } from '@/lib/constants';

const API = `${SERVER_URL}/api/crm`;

export default function CrmDashboardPage() {
  const [stats, setStats] = useState({
    totalContacts: 0,
    totalBookings: 0,
    upcomingBookings: 0,
    totalAgents: 0,
    recentContacts: [],
    upcomingBookingList: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const agentRes = await axios.get(`${API}/my-agents`);
        let recentContacts = [], upcomingBookingList = [];
        for (const agent of agentRes.data) {
          try {
            const [contactsRes, bookingsRes] = await Promise.all([
              axios.get(`${API}/agents/${agent.id}/contacts`),
              axios.get(`${API}/agents/${agent.id}/bookings`)
            ]);
            for (const c of contactsRes.data) recentContacts.push({ ...c, agentName: agent.name });
            for (const b of bookingsRes.data) upcomingBookingList.push({ ...b, agentName: agent.name });
          } catch {}
        }
        recentContacts = recentContacts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
        const now = new Date();
        upcomingBookingList = upcomingBookingList
          .filter(b => new Date(b.startTime) >= now)
          .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
          .slice(0, 5);

        const allBookings = upcomingBookingList.length + 0;
        setStats({
          totalContacts: recentContacts.length,
          totalBookings: allBookings,
          upcomingBookings: upcomingBookingList.length,
          totalAgents: agentRes.data.length,
          recentContacts,
          upcomingBookingList,
        });
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const cards = [
    {
      label: 'Active Agents',
      value: stats.totalAgents,
      icon: Bot,
      color: 'text-primary',
      bg: 'bg-primary/10',
      to: '/crm/agents',
    },
    {
      label: 'Total Contacts',
      value: stats.totalContacts,
      icon: Users,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      to: '/crm/contacts',
    },
    {
      label: 'Upcoming Bookings',
      value: stats.upcomingBookings,
      icon: Calendar,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      to: '/crm/calendar',
    },
    {
      label: 'Calls Today',
      value: 0,
      icon: PhoneCall,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
      to: '/crm/calls',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back 👋</h1>
        <p className="text-muted-foreground mt-1">Here's what's happening with your voice agents today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(card => (
          <Link to={card.to} key={card.label}>
            <Card className="hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">{card.label}</p>
                    <p className="text-3xl font-bold mt-2">{card.value}</p>
                  </div>
                  <div className={`w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center ${card.color}`}>
                    <card.icon className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-4 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                  <span>View details</span>
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="w-4 h-4 text-emerald-500" />
              Upcoming Bookings
            </CardTitle>
            <CardDescription>Next scheduled appointments</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.upcomingBookingList.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">No upcoming bookings</div>
            ) : (
              <div className="space-y-3">
                {stats.upcomingBookingList.map(b => (
                  <div key={b.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{b.contact?.name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{b.agentName}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono">{new Date(b.startTime).toLocaleDateString()}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="w-4 h-4 text-blue-500" />
              Recent Contacts
            </CardTitle>
            <CardDescription>Newest contacts captured by your agents</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentContacts.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">No contacts yet</div>
            ) : (
              <div className="space-y-3">
                {stats.recentContacts.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                        {(c.name || c.email || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{c.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.phone || c.email || '—'}</p>
                      </div>
                    </div>
                    <Badge tone="primary" className="shrink-0">{c.agentName}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4 text-primary" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Button asChild variant="outline" className="h-auto py-4 justify-start">
            <Link to="/crm/agents">
              <Bot className="w-4 h-4 mr-2" />
              <div className="text-left">
                <div className="font-semibold text-sm">Manage Agents</div>
                <div className="text-xs text-muted-foreground">Configure voice agents</div>
              </div>
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto py-4 justify-start">
            <Link to="/crm/calendar">
              <Calendar className="w-4 h-4 mr-2" />
              <div className="text-left">
                <div className="font-semibold text-sm">View Calendar</div>
                <div className="text-xs text-muted-foreground">See scheduled bookings</div>
              </div>
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto py-4 justify-start">
            <Link to="/crm/calls">
              <PhoneCall className="w-4 h-4 mr-2" />
              <div className="text-left">
                <div className="font-semibold text-sm">Call History</div>
                <div className="text-xs text-muted-foreground">Review past calls</div>
              </div>
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto py-4 justify-start">
            <Link to="/crm/contacts">
              <Users className="w-4 h-4 mr-2" />
              <div className="text-left">
                <div className="font-semibold text-sm">Browse Contacts</div>
                <div className="text-xs text-muted-foreground">All captured leads</div>
              </div>
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}