import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, MessageSquare, Palette, Smile, ClosedCaption, XCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocalParticipant } from '@livekit/components-react';
import { useMeetingStore } from '../../store/meetingStore';
import { useState } from 'react';
import { socketService } from '../../services/socket';
import { useTranscription } from '../../hooks/useTranscription';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';
import toast from 'react-hot-toast';

const EMOJIS = ['👍', '❤️', '👏', '😂', '✋'];

const ControlBar = () => {
  const navigate = useNavigate();
  const { id: meetingId } = useParams<{ id: string }>();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const { activePanel, setActivePanel } = useMeetingStore();
  const [showReactions, setShowReactions] = useState(false);
  const user = useAuthStore(state => state.user);
  
  // Start transcribing local audio when mic is enabled
  useTranscription(meetingId || '', isMicrophoneEnabled);

  const isHost = user?.role === 'host';

  const handleLeave = () => {
    navigate('/dashboard');
  };

  const handleEndForAll = async () => {
    if (!window.confirm('Are you sure you want to end this meeting for everyone? This will generate the final AI debrief.')) return;
    try {
      await api.post(`/meetings/${meetingId}/end`);
      toast.success('Meeting ended. Generating debrief...');
      navigate(`/meeting/${meetingId}/summary`);
    } catch {
      toast.error('Failed to end meeting');
    }
  };

  const toggleMic = async () => {
    await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  };

  const toggleCamera = async () => {
    await localParticipant.setCameraEnabled(!isCameraEnabled);
  };

  const toggleScreenShare = async () => {
    await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 p-3 rounded-2xl glass-panel border-white/10 z-50">
      
      <button 
        onClick={toggleMic}
        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${!isMicrophoneEnabled ? 'bg-red-500/20 text-red-500 border border-red-500/30' : 'bg-white/5 hover:bg-white/10'}`}
      >
        {!isMicrophoneEnabled ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </button>

      <button 
        onClick={toggleCamera}
        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${!isCameraEnabled ? 'bg-red-500/20 text-red-500 border border-red-500/30' : 'bg-white/5 hover:bg-white/10'}`}
      >
        {!isCameraEnabled ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
      </button>

      <div className="w-px h-8 bg-white/10 mx-2" />

      <div className="relative">
        {showReactions && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 p-2 bg-black/80 backdrop-blur-md rounded-2xl border border-white/10 flex gap-2 shadow-2xl animate-in slide-in-from-bottom-2">
            {EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => {
                  socketService.getSocket()?.emit('meeting-reaction', { meetingId, emoji });
                  setShowReactions(false);
                }}
                className="w-10 h-10 text-2xl hover:bg-white/10 rounded-xl transition-colors hover:scale-110 active:scale-95"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <button 
          onClick={() => setShowReactions(!showReactions)}
          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${showReactions ? 'bg-nexus-accent/20 text-nexus-accent border border-nexus-accent/30' : 'bg-white/5 hover:bg-white/10'}`}
        >
          <Smile className="w-5 h-5" />
        </button>
      </div>

      <button 
        onClick={toggleScreenShare}
        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${isScreenShareEnabled ? 'bg-nexus-primary/20 text-nexus-primary border border-nexus-primary/30' : 'bg-white/5 hover:bg-white/10'}`}
      >
        <MonitorUp className="w-5 h-5" />
      </button>

      <button 
        onClick={() => setActivePanel('chat')}
        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${activePanel === 'chat' ? 'bg-nexus-cyan/20 text-nexus-cyan border border-nexus-cyan/30' : 'bg-white/5 hover:bg-white/10'}`}
      >
        <MessageSquare className="w-5 h-5" />
      </button>

      <button 
        onClick={() => setActivePanel('whiteboard')}
        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${activePanel === 'whiteboard' ? 'bg-[#FFD600]/20 text-[#FFD600] border border-[#FFD600]/30' : 'bg-white/5 hover:bg-white/10'}`}
      >
        <Palette className="w-5 h-5" />
      </button>

      <button 
        onClick={() => setActivePanel('transcript')}
        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${activePanel === 'transcript' ? 'bg-nexus-success/20 text-nexus-success border border-nexus-success/30' : 'bg-white/5 hover:bg-white/10'}`}
        title="Live Transcript"
      >
        <ClosedCaption className="w-5 h-5" />
      </button>

      <div className="w-px h-8 bg-white/10 mx-2" />

      {isHost && (
        <button 
          onClick={handleEndForAll}
          className="w-auto px-4 h-12 rounded-xl flex items-center justify-center gap-2 bg-nexus-danger/90 hover:bg-nexus-danger shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all text-white font-bold text-sm ml-2 border border-nexus-danger/50"
        >
          <XCircle className="w-4 h-4" />
          End for All
        </button>
      )}

      <button 
        onClick={handleLeave}
        className="w-16 h-12 rounded-xl flex items-center justify-center bg-white/10 hover:bg-white/20 transition-all text-white ml-2"
        title="Leave Meeting"
      >
        <PhoneOff className="w-5 h-5" />
      </button>

    </div>
  );
};

export default ControlBar;
