import React, { useEffect, useState } from 'react';
import { Activity, Users, AlertTriangle } from 'lucide-react';
import { useMeetingStore } from '../../store/meetingStore';

interface HostDashboardProps {
  meetingId: string;
}

const HostDashboard: React.FC<HostDashboardProps> = ({ meetingId }) => {
  const { activeParticipants, roomScores } = useMeetingStore();
  const [liveStats, setLiveStats] = useState({ roomAvg: 0, activeParticipants: 0 });
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  useEffect(() => {
    // Connect to Server-Sent Events for live room analytics
    const baseUrl = import.meta.env.VITE_ANALYSIS_URL || '';
    const sseUrl = `${baseUrl}/api/analytics/meeting/${meetingId}/stream`;
    const eventSource = new EventSource(sseUrl);

    eventSource.onopen = () => {
      setSseStatus('connected');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLiveStats({
          roomAvg: data.room_avg,
          activeParticipants: data.active_participants
        });
      } catch (err) {
        console.error('SSE Error:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Connection Error:', err);
      setSseStatus('error');
    };

    return () => {
      eventSource.close();
    };
  }, [meetingId]);

  // Sort participants by lowest focus score first to highlight disengaged users
  const sortedParticipants = Object.values(activeParticipants).sort((a, b) => {
    const scoreA = roomScores[a.userId] ?? 100;
    const scoreB = roomScores[b.userId] ?? 100;
    return scoreA - scoreB;
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      
      {/* Top Stats */}
      <div className="p-6 grid grid-cols-2 gap-4 border-b border-white/5">
        <div className="glass-panel p-4 rounded-xl flex flex-col items-center justify-center bg-black/20">
          <Activity className="w-6 h-6 text-nexus-primary mb-2" />
          <div className="text-2xl font-bold font-mono">{liveStats.roomAvg > 0 ? liveStats.roomAvg : '--'}%</div>
          <div className="text-xs text-nexus-muted mt-1 uppercase tracking-wider">Room Avg Focus</div>
        </div>
        
        <div className="glass-panel p-4 rounded-xl flex flex-col items-center justify-center bg-black/20 relative">
          {sseStatus === 'error' && (
            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-nexus-danger animate-pulse" title="Connection lost" />
          )}
          {sseStatus === 'connecting' && (
            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-nexus-warning animate-pulse" title="Connecting..." />
          )}
          {sseStatus === 'connected' && (
            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-nexus-success" title="Live" />
          )}
          <Users className="w-6 h-6 text-nexus-accent mb-2" />
          <div className="text-2xl font-bold">{Object.keys(activeParticipants).length + 1}</div>
          <div className="text-xs text-nexus-muted mt-1 uppercase tracking-wider">Total Connected</div>
        </div>
      </div>

      {/* Host Controls */}
      <div className="px-6 py-4 border-b border-white/5">
        <h3 className="text-sm font-semibold text-nexus-muted uppercase tracking-wider mb-3">Host Controls</h3>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              import('../../services/socket').then(({ socketService }) => {
                socketService.getSocket()?.emit('host-mute-all', { meetingId });
              });
            }}
            className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium transition-colors border border-white/10 text-white"
          >
            Mute All
          </button>
          <button 
            onClick={() => {
              import('../../services/socket').then(({ socketService }) => {
                socketService.getSocket()?.emit('host-lock-meeting', { meetingId });
              });
            }}
            className="flex-1 py-2 bg-nexus-danger/10 hover:bg-nexus-danger/20 text-nexus-danger rounded-lg text-sm font-medium transition-colors border border-nexus-danger/20"
          >
            Lock Meeting
          </button>
        </div>
      </div>

      {/* Participant List (Sorted by attention) */}
      <div className="p-6 flex-1 overflow-y-auto">
        <h3 className="text-sm font-semibold text-nexus-muted uppercase tracking-wider mb-4">Participant Attention</h3>
        
        <div className="flex flex-col gap-3">
          {sortedParticipants.map(p => {
            const score = roomScores[p.userId] ?? '--';
            const isLow = typeof score === 'number' && score < 40;
            
            return (
              <div key={p.userId} className={`p-3 rounded-xl flex items-center justify-between border ${isLow ? 'bg-nexus-danger/10 border-nexus-danger/30' : 'bg-white/5 border-white/5'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-nexus-primary/20 flex items-center justify-center font-bold text-sm">
                    {p.name.charAt(0)}
                  </div>
                  <div className="text-sm">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-nexus-muted opacity-70">@{p.username}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {isLow && <AlertTriangle className="w-4 h-4 text-nexus-danger animate-pulse" />}
                  <div className={`font-mono font-bold ${isLow ? 'text-nexus-danger' : 'text-nexus-success'}`}>
                    {score}%
                  </div>
                </div>
              </div>
            );
          })}
          
          {sortedParticipants.length === 0 && (
            <div className="text-center text-sm text-nexus-muted py-8">
              Waiting for participants to join...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HostDashboard;
