import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LiveKitRoom, PreJoin, type LocalUserChoices } from '@livekit/components-react';
import '@livekit/components-styles';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import LiveKitGrid from '../components/meeting/LiveKitGrid';
import ControlBar from '../components/meeting/ControlBar';
import HostDashboard from '../components/meeting/HostDashboard';
import { Brain } from 'lucide-react';
import toast from 'react-hot-toast';
import { useMeetingStore } from '../store/meetingStore';
import ChatPanel from '../components/meeting/ChatPanel';
import WhiteboardPanel from '../components/meeting/WhiteboardPanel';
import TranscriptPanel from '../components/meeting/TranscriptPanel';
import SocketListener from '../components/meeting/SocketListener';

const MeetingRoom = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const activePanel = useMeetingStore(state => state.activePanel);
  
  const [token, setToken] = useState<string>('');
  const [wsUrl, setWsUrl] = useState<string>('');
  const [preJoinChoices, setPreJoinChoices] = useState<LocalUserChoices | undefined>(undefined);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data } = await api.get(`/meetings/room/${id}/token`);
        setToken(data.token);
        setWsUrl(data.wsUrl);
      } catch (error) {
        console.error('Failed to fetch LiveKit token', error);
        toast.error('Failed to join meeting room');
        navigate('/dashboard');
      }
    };
    if (id) fetchToken();
  }, [id, navigate]);

  useEffect(() => {
    // When joining, connect the socket service
    if (preJoinChoices) {
      import('../services/socket').then(({ socketService }) => {
        const socket = socketService.connect();
        socket.emit('join-room', {
          meetingId: id,
          roomCode: id, // We might need to differentiate if id is roomCode vs ObjectId, but meetingHandler handles it
          username: user?.username,
          name: user?.name,
          avatarColor: user?.avatarColor
        });
      });
    }
  }, [preJoinChoices, id, user]);

  const isHost = user?.role === 'host';

  // Determine what to show in the right panel
  const showRightPanel = isHost || activePanel !== 'none';
  const renderRightPanel = () => {
    if (activePanel === 'chat') return <ChatPanel />;
    if (activePanel === 'whiteboard') return <WhiteboardPanel />;
    if (activePanel === 'transcript') return <TranscriptPanel />;
    
    if (isHost && (activePanel === 'none' || activePanel === 'intelligence')) {
      return (
        <>
          <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-nexus-primary" />
              <span className="font-bold text-lg">Nexus Intelligence</span>
            </div>
            <div className="flex items-center gap-1 text-sm text-nexus-success bg-nexus-success/10 px-2 py-1 rounded border border-nexus-success/20">
              <span className="w-2 h-2 rounded-full bg-nexus-success animate-pulse" />
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
        <div className="w-12 h-12 border-4 border-nexus-primary border-t-transparent rounded-full animate-spin mb-4 z-10" />
        <p className="text-nexus-muted font-medium animate-pulse z-10">Connecting to secure Nexus network...</p>
      </div>
    );
  }

  // PreJoin Lobby State
  if (!preJoinChoices) {
    return (
      <div className="w-screen h-screen bg-nexus-bg flex flex-col items-center justify-center bg-glass-gradient overflow-hidden">
        <div className="absolute inset-0 bg-nexus-primary/5 blur-[150px] -z-10" />
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-nexus-primary">Nexus Lobby</h1>
          <p className="text-nexus-muted mt-2">Configure your devices before joining</p>
        </div>
        <div className="p-8 rounded-3xl glass-panel border border-white/10 shadow-2xl backdrop-blur-2xl max-w-2xl w-full">
          <PreJoin 
            defaults={{
              videoEnabled: true,
              audioEnabled: true,
              username: user?.name || '',
            }}
            onSubmit={(values) => setPreJoinChoices(values)}
            className="nexus-prejoin"
          />
        </div>
        <style>{`
          /* Custom overrides for LiveKit PreJoin to match Ultra Promax aesthetic */
          .lk-prejoin { background: transparent !important; }
          .lk-video-container { border-radius: 1rem !important; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }
          .lk-button { background: linear-gradient(135deg, #7C3AED 0%, #A855F7 100%) !important; border-radius: 0.75rem !important; transition: all 0.3s !important; border: none !important; }
          .lk-button:hover { box-shadow: 0 0 20px rgba(124, 58, 237, 0.5) !important; filter: brightness(1.1); }
          .lk-form-control { background: rgba(0,0,0,0.5) !important; border: 1px solid rgba(255,255,255,0.1) !important; border-radius: 0.75rem !important; color: white !important; }
          .lk-device-menu > button { background: rgba(0,0,0,0.5) !important; border: 1px solid rgba(255,255,255,0.1) !important; border-radius: 0.5rem !important; }
        `}</style>
      </div>
    );
  }

  return (
    <LiveKitRoom
      video={preJoinChoices.videoEnabled}
      audio={preJoinChoices.audioEnabled}
      token={token}
      serverUrl={wsUrl}
      connect={true}
      className="w-screen h-screen bg-nexus-bg flex flex-col md:flex-row overflow-hidden relative"
      onDisconnected={() => navigate('/dashboard')}
    >
      <SocketListener />
      {/* Main Video Area */}
      <div className="flex-1 relative h-full flex items-center justify-center bg-black/40">
        <LiveKitGrid />
        <ControlBar />
      </div>

      {/* Dynamic Right Panel */}
      {showRightPanel && (
        <div className="w-full md:w-80 lg:w-96 h-full glass-panel border-l border-nexus-border/50 flex flex-col z-20 transition-all duration-300 bg-black/20 backdrop-blur-md">
          {renderRightPanel()}
        </div>
      )}
    </LiveKitRoom>
  );
};

export default MeetingRoom;
