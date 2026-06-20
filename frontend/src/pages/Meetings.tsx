import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Video, Calendar, Clock, Users, Search, Filter } from 'lucide-react';
import { meetingService } from '../services/meetingService';
import type { Meeting } from '../types';
import toast from 'react-hot-toast';
import { Button } from '../components/ui/Button';

const Meetings = () => {
  const [hostedMeetings, setHostedMeetings] = useState<Meeting[]>([]);
  const [invitedMeetings, setInvitedMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'hosted' | 'invited'>('all');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMeetings = async () => {
      try {
        const data = await meetingService.getMyMeetings();
        setHostedMeetings(data.hosted);
        setInvitedMeetings(data.invited);
      } catch {
        toast.error('Failed to load meetings');
      } finally {
        setIsLoading(false);
      }
    };
    fetchMeetings();
  }, []);

  const allMeetings = (() => {
    let list: (Meeting & { _isHost: boolean })[] = [];
    if (filter === 'all' || filter === 'hosted') {
      list = list.concat(hostedMeetings.map(m => ({ ...m, _isHost: true })));
    }
    if (filter === 'all' || filter === 'invited') {
      list = list.concat(invitedMeetings.map(m => ({ ...m, _isHost: false })));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m => m.title.toLowerCase().includes(q) || m.roomCode.toLowerCase().includes(q));
    }
    return list.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  })();

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-nexus-success/20 text-nexus-success border-nexus-success/30',
      scheduled: 'bg-nexus-primary/20 text-nexus-primary border-nexus-primary/30',
      ended: 'bg-white/10 text-nexus-muted border-white/10',
      cancelled: 'bg-nexus-danger/20 text-nexus-danger border-nexus-danger/30',
    };
    return styles[status] || styles.scheduled;
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">All Meetings</h1>
          <p className="text-nexus-muted mt-1">View and manage all your meetings in one place.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-nexus-muted" />
          <input
            type="text"
            placeholder="Search by title or room code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-black/40 border border-nexus-border rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:border-nexus-primary focus:ring-1 focus:ring-nexus-primary transition-all text-sm"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'hosted', 'invited'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                filter === f 
                  ? 'bg-nexus-primary/20 text-nexus-primary border-nexus-primary/30' 
                  : 'bg-white/5 text-nexus-muted border-white/5 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Filter className="w-3.5 h-3.5 inline mr-1.5" />
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Meeting Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        {isLoading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}
          </div>
        ) : allMeetings.length === 0 ? (
          <div className="p-12 flex flex-col items-center text-center">
            <Video className="w-12 h-12 text-nexus-muted/50 mb-4" />
            <h3 className="text-lg font-bold mb-1">No meetings found</h3>
            <p className="text-nexus-muted text-sm">{search ? 'Try a different search term.' : 'You have no meetings yet.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-6 py-4 text-xs font-semibold text-nexus-muted uppercase tracking-wider">Title</th>
                  <th className="px-6 py-4 text-xs font-semibold text-nexus-muted uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold text-nexus-muted uppercase tracking-wider hidden md:table-cell">Date & Time</th>
                  <th className="px-6 py-4 text-xs font-semibold text-nexus-muted uppercase tracking-wider hidden lg:table-cell">Participants</th>
                  <th className="px-6 py-4 text-xs font-semibold text-nexus-muted uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-xs font-semibold text-nexus-muted uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {allMeetings.map((meeting) => {
                  const date = new Date(meeting.scheduledAt);
                  const isLive = meeting.status === 'active';
                  return (
                    <tr key={meeting._id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white">{meeting.title}</div>
                        <div className="text-xs text-nexus-muted mt-0.5">#{meeting.roomCode}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${statusBadge(meeting.status)} ${isLive ? 'animate-pulse' : ''}`}>
                          {meeting.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <div className="text-sm flex items-center gap-1.5 text-nexus-muted">
                          <Calendar className="w-3.5 h-3.5" />
                          {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          <Clock className="w-3.5 h-3.5 ml-2" />
                          {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="px-6 py-4 hidden lg:table-cell">
                        <div className="flex items-center gap-1.5 text-sm text-nexus-muted">
                          <Users className="w-3.5 h-3.5" />
                          {meeting.participantUsernames.length}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-medium px-2 py-1 rounded-md ${meeting._isHost ? 'bg-nexus-primary/10 text-nexus-primary' : 'bg-nexus-accent/10 text-nexus-accent'}`}>
                          {meeting._isHost ? 'Host' : 'Invited'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant={isLive ? 'primary' : 'ghost'}
                          onClick={() => navigate(`/lobby/${meeting.roomCode}`)}
                          className={`text-sm py-2 px-4 ${isLive ? 'bg-nexus-success text-black hover:bg-green-500' : ''}`}
                        >
                          {isLive ? 'Join' : 'Open'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default Meetings;
