import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LiveKitRoom, PreJoin, type LocalUserChoices } from '@livekit/components-react';
import '@livekit/components-styles';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import LiveKitGrid from '../components/meeting/LiveKitGrid';
import ControlBar from '../components/meeting/ControlBar';
import HostDashboard from '../components/meeting/HostDashboard';
import { Brain, Clock, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useMeetingStore } from '../store/meetingStore';
import ChatPanel from '../components/meeting/ChatPanel';
import WhiteboardPanel from '../components/meeting/WhiteboardPanel';
import TranscriptPanel from '../components/meeting/TranscriptPanel';
import SocketListener from '../components/meeting/SocketListener';

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const MeetingRoom = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const activePanel = useMeetingStore(state => state.activePanel);
  const setConsentGiven = useMeetingStore(state => state.setConsentGiven);
  
  const [token, setToken] = useState<string>('');
  const [wsUrl, setWsUrl] = useState<string>('');
  const [preJoinChoices, setPreJoinChoices] = useState<LocalUserChoices | undefined>(undefined);
  
  // Meeting State Machine
  const [meetingState, setMeetingState] = useState<'initializing' | 'waiting' | 'active' | 'ended'>('initializing');
  const [actualStartTime, setActualStartTime] = useState<Date | null>(null);
  const [elapsedSecs, setElapsedSecs] = useState<number>(0);
  const [scheduledDurationMins, setScheduledDurationMins] = useState<number>(60); // Default, should fetch from API ideally
  const [warningLevel, setWarningLevel] = useState<'none' | 'yellow' | 'red'>('none');

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data } = await api.get(`/meetings/room/${id}/token`);
        setToken(data.token);
        setWsUrl(data.wsUrl);
        if (data.consentGiven !== undefined) setConsentGiven(data.consentGiven);
        if (data.scheduledDurationMins) setScheduledDurationMins(data.scheduledDurationMins);
      } catch (error) {
        console.error('Failed to fetch LiveKit token', error);
        toast.error('Failed to join meeting room');
        navigate('/dashboard');
      }
    };
    if (id) fetchToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, navigate]);

  useEffect(() => {
    if (preJoinChoices) {
      import('../services/socket').then(({ socketService }) => {
        const socket = socketService.connect();
        
        socket.emit('join-room', {
          meetingId: id,
          roomCode: id,
          username: user?.username,
          name: user?.name,
          avatarColor: user?.avatarColor
        });

        socket.on('waiting-room-status', () => setMeetingState('waiting'));
        socket.on('admitted', (data) => {
          setActualStartTime(new Date(data.actualStartTime));
          setMeetingState('active');
        });
        socket.on('meeting-started', (data) => {
          setActualStartTime(new Date(data.actualStartTime));
          setMeetingState('active');
        });
        socket.on('meeting-ended-by-host', (data) => {
           setMeetingState('ended');
           setTimeout(() => navigate(`/meeting/${id}/summary`), data.redirectAfter || 3000);
        });
        socket.on('denied', () => {
           toast.error('The host denied your entry.');
           navigate('/dashboard');
        });
        
        // If we don't get a waiting-room-status immediately, assume active (socket logic handles immediate emits if active)
      });
    }
    
    return () => {
       import('../services/socket').then(({ socketService }) => {
         socketService.getSocket()?.off('waiting-room-status');
         socketService.getSocket()?.off('admitted');
         socketService.getSocket()?.off('meeting-started');
         socketService.getSocket()?.off('meeting-ended-by-host');
         socketService.getSocket()?.off('denied');
       });
    };
  }, [preJoinChoices, id, user, navigate]);

  // Timer Synchronization Loop
  useEffect(() => {
    if (meetingState === 'active' && actualStartTime) {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - actualStartTime.getTime()) / 1000);
        setElapsedSecs(elapsed);
        
        const scheduledSecs = scheduledDurationMins * 60;
        const remaining = scheduledSecs - elapsed;
        
        if (remaining <= 0) {
           setWarningLevel('red');
        } else if (remaining <= 300) { // 5 minutes
           setWarningLevel('yellow');
        } else {
           setWarningLevel('none');
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [meetingState, actualStartTime, scheduledDurationMins]);

  const isHost = user?.role === 'host';
  const showRightPanel = isHost || activePanel !== 'none';

  const renderRightPanel = () => {
    if (activePanel === 'chat') return <ChatPanel />;
    if (activePanel === 'whiteboard') return <WhiteboardPanel />;
    if (activePanel === 'transcript') return <TranscriptPanel />;
    
    if (isHost && (activePanel === 'none' || activePanel === 'intelligence')) {
      return (
        <>
          <div className="p-4 border-b border-nexus-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-nexus-primary" />
              <span className="font-semibold text-label font-display">Nexus Intelligence</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-nexus-success bg-nexus-success/10 px-2 py-1 rounded-pill border border-nexus-success/20">
              <span className="w-1.5 h-1.5 rounded-full bg-nexus-success animate-pulse-soft" />
              Live
            </div>
          </div>
          <HostDashboard meetingId={id || ''} />
        </>
      );
    }
    return null;
  };

  if (!token || !wsUrl) {
    return (
      <div className="w-screen h-screen bg-nexus-bg flex flex-col items-center justify-center relative">
        <div className="w-10 h-10 border-2 border-nexus-primary border-t-transparent rounded-full animate-spin mb-4 z-10" />
        <p className="text-nexus-muted text-sm font-medium z-10">Connecting to secure network...</p>
      </div>
    );
  }

  if (!preJoinChoices) {
    return (
      <div className="w-screen h-screen bg-nexus-bg flex flex-col items-center justify-center overflow-hidden">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold font-display text-gradient-primary">Nexus Lobby</h1>
          <p className="text-nexus-muted mt-1 text-sm">Configure your devices before joining</p>
        </div>
        <div className="p-6 rounded-panel bg-nexus-surface border border-nexus-border shadow-matte-lg max-w-2xl w-full">
          <PreJoin 
            defaults={{ videoEnabled: true, audioEnabled: true, username: user?.name || '' }}
            onSubmit={(values) => setPreJoinChoices(values)}
            className="nexus-prejoin"
          />
        </div>
        <style>{`
          .lk-prejoin { background: transparent !important; }
          .lk-video-container { border-radius: 12px !important; overflow: hidden; border: 1px solid rgba(255,255,255,0.04); }
          .lk-button { background: linear-gradient(135deg, #5B57FF 0%, #00D4FF 100%) !important; border-radius: 9999px !important; transition: all 0.2s !important; border: none !important; }
          .lk-button:hover { opacity: 0.9; }
          .lk-form-control { background: #16181D !important; border: 1px solid rgba(255,255,255,0.04) !important; border-radius: 12px !important; color: white !important; }
          .lk-device-menu > button { background: #16181D !important; border: 1px solid rgba(255,255,255,0.04) !important; border-radius: 8px !important; }
        `}</style>
      </div>
    );
  }

  // Waiting Room View
  if (meetingState === 'waiting') {
    return (
      <div className="w-screen h-screen bg-nexus-bg flex flex-col items-center justify-center relative overflow-hidden">
         <div className="z-10 flex flex-col items-center text-center p-8 max-w-md w-full bg-nexus-surface rounded-panel border border-nexus-border">
           <div className="w-14 h-14 rounded-full bg-nexus-primary/15 flex items-center justify-center mb-6">
             <Clock className="w-7 h-7 text-nexus-primary animate-pulse-soft" />
           </div>
           <h2 className="text-xl font-semibold font-display mb-2">Waiting for the Host</h2>
           <p className="text-nexus-muted text-sm mb-8">Please wait, the meeting host will let you in soon.</p>
           
           <div className="w-full aspect-video rounded-card overflow-hidden bg-nexus-bg border border-nexus-border relative">
              <span className="absolute inset-0 flex items-center justify-center text-nexus-muted/30 text-sm">Camera Ready</span>
           </div>
         </div>
      </div>
    );
  }

  if (meetingState === 'ended') {
    return (
      <div className="w-screen h-screen bg-nexus-bg flex flex-col items-center justify-center relative">
         <div className="p-8 max-w-md w-full bg-nexus-surface rounded-panel text-center border border-nexus-border">
            <h2 className="text-2xl font-semibold font-display mb-3">Meeting Ended</h2>
            <p className="text-nexus-muted text-sm mb-6">The host has ended this meeting for all participants.</p>
            <div className="w-8 h-8 border-2 border-nexus-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-nexus-muted mt-4">Redirecting to summary...</p>
         </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      video={preJoinChoices.videoEnabled}
      audio={preJoinChoices.audioEnabled}
      token={token}
      serverUrl={wsUrl}
      connect={meetingState === 'active'}
      className="w-screen h-screen bg-nexus-bg flex flex-col overflow-hidden relative"
      onDisconnected={() => navigate('/dashboard')}
    >
      <SocketListener />
      
      {/* Absolute Top Timer Header — matte overlay, no blur */}
      <div className="absolute top-0 left-0 w-full h-12 z-50 pointer-events-none flex items-center justify-between px-4">
         <div className="flex items-center gap-2 matte-overlay px-3 py-1.5 rounded-pill pointer-events-auto">
            <span className={`font-mono text-sm font-medium ${warningLevel === 'red' ? 'text-nexus-danger animate-pulse-soft' : warningLevel === 'yellow' ? 'text-nexus-warning' : 'text-nexus-text'}`}>
              {formatTime(elapsedSecs)}
            </span>
         </div>
         {warningLevel !== 'none' && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-pill border pointer-events-auto ${warningLevel === 'red' ? 'bg-nexus-danger/15 border-nexus-danger/30 text-nexus-danger' : 'bg-nexus-warning/15 border-nexus-warning/30 text-nexus-warning'}`}>
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">
                {warningLevel === 'red' ? 'Scheduled time elapsed' : 'Meeting ends in 5 mins'}
              </span>
            </div>
         )}
         <div className="w-20" /> {/* Spacer */}
      </div>

      <div className="flex-1 flex flex-col md:flex-row h-full relative pt-12 pb-20">
        {/* Main Video Area */}
        <div className="flex-1 relative h-full flex items-center justify-center">
          <LiveKitGrid />
        </div>

        {/* Dynamic Right Panel — solid Surface, no blur */}
        {showRightPanel && (
          <div className="w-full md:w-80 lg:w-96 h-full bg-nexus-surface border-l border-nexus-border flex flex-col z-20 transition-all duration-200">
            {renderRightPanel()}
          </div>
        )}
      </div>

      <ControlBar />
    </LiveKitRoom>
  );
};

export default MeetingRoom;
