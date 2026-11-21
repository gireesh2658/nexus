import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, MessageSquare, Palette, Smile, ClosedCaption, XCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocalParticipant, useRoomContext } from '@livekit/components-react';
import { useMeetingStore } from '../../store/meetingStore';
import { useState } from 'react';
import { socketService } from '../../services/socket';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';
import toast from 'react-hot-toast';

const EMOJIS = ['👍', '❤️', '👏', '😂', '✋'];

interface ControlBarProps {
  isHost?: boolean;
}

const ControlBar: React.FC<ControlBarProps> = ({ isHost: propIsHost }) => {
  const navigate = useNavigate();
  const { id: meetingId } = useParams<{ id: string }>();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const room = useRoomContext();
  const { activePanel, setActivePanel } = useMeetingStore();
  const [showReactions, setShowReactions] = useState(false);
  const user = useAuthStore(state => state.user);
  const currentMeeting = useMeetingStore(state => state.currentMeeting);

  const isHost = propIsHost !== undefined
    ? propIsHost
    : (currentMeeting?.hostId === user?.id || user?.role === 'host');

  const [isEnding, setIsEnding] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const handleLeave = async () => {
    if (isLeaving) return;
    setIsLeaving(true);

    try {
      const targetId = currentMeeting?.id || meetingId;

      // 1. Unpublish and stop owned media tracks
      if (localParticipant) {
        try {
          await localParticipant.setMicrophoneEnabled(false);
          await localParticipant.setCameraEnabled(false);
          await localParticipant.setScreenShareEnabled(false);
        } catch (trackErr) {
          console.warn('Track unpublish warning during leave:', trackErr);
        }
      }

      // 2. Emit established socket leave-room event
      socketService.getSocket()?.emit('leave-room', {
        meetingId: targetId,
        username: user?.username,
      });

      // 3. Clear transient meeting state
      useMeetingStore.getState().setActivePanel('none');
      useMeetingStore.getState().setConsentGiven(false);

      // 4. Disconnect from LiveKit room
      if (room) {
        await room.disconnect(true);
      }

      toast.success('Left meeting');
      navigate('/dashboard');
    } catch (err) {
      console.error('Error during meeting cleanup:', err);
      navigate('/dashboard');
    } finally {
      setIsLeaving(false);
    }
  };

  const handleEndForAll = async () => {
    if (isEnding) return;
    if (!window.confirm('Are you sure you want to end this meeting for everyone? This will generate the final AI debrief.')) return;
    setIsEnding(true);
    try {
      const targetId = currentMeeting?.id || meetingId;
      const res = await api.post(`/meetings/${targetId}/end`);
      toast.success('Meeting ended. Generating debrief...');

      // Cleanup local tracks before navigating
      if (localParticipant) {
        try {
          await localParticipant.setMicrophoneEnabled(false);
          await localParticipant.setCameraEnabled(false);
          await localParticipant.setScreenShareEnabled(false);
        } catch (e) {
          console.warn('Track cleanup on end:', e);
        }
      }

      if (room) {
        await room.disconnect(true);
      }

      const finalId = res.data?.meetingId || targetId;
      navigate(`/meeting/${finalId}/summary`);
    } catch (err: any) {
      setIsEnding(false);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to end meeting';
      toast.error(errorMsg);
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
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 rounded-pill matte-overlay z-50">
      
      <button 
        onClick={toggleMic}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${!isMicrophoneEnabled ? 'bg-nexus-danger/15 text-nexus-danger border border-nexus-danger/30' : 'hover:bg-white/10'}`}
        title={isMicrophoneEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
      >
        {!isMicrophoneEnabled ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </button>

      <button 
        onClick={toggleCamera}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${!isCameraEnabled ? 'bg-nexus-danger/15 text-nexus-danger border border-nexus-danger/30' : 'hover:bg-white/10'}`}
        title={isCameraEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
      >
        {!isCameraEnabled ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
      </button>

      <div className="w-px h-8 bg-nexus-border mx-2" />

      <div className="relative">
        {showReactions && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 p-2 matte-overlay rounded-panel flex gap-2 shadow-matte-lg animate-in slide-in-from-bottom-2">
            {EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => {
                  socketService.getSocket()?.emit('meeting-reaction', { meetingId, emoji });
                  setShowReactions(false);
                }}
                className="w-10 h-10 text-2xl hover:bg-white/10 rounded-xl transition-transform hover:scale-110 active:scale-95"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <button 
          onClick={() => setShowReactions(!showReactions)}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${showReactions ? 'bg-nexus-cyan/15 text-nexus-cyan border border-nexus-cyan/30' : 'hover:bg-white/10'}`}
          title="Send Reaction"
        >
          <Smile className="w-5 h-5" />
        </button>
      </div>

      <button 
        onClick={toggleScreenShare}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isScreenShareEnabled ? 'bg-nexus-primary/15 text-nexus-primary border border-nexus-primary/30' : 'hover:bg-white/10'}`}
        title="Share Screen"
      >
        <MonitorUp className="w-5 h-5" />
      </button>

      <button 
        onClick={() => setActivePanel(activePanel === 'chat' ? 'none' : 'chat')}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${activePanel === 'chat' ? 'bg-nexus-cyan/15 text-nexus-cyan border border-nexus-cyan/30' : 'hover:bg-white/10'}`}
        title="Toggle Chat"
      >
        <MessageSquare className="w-5 h-5" />
      </button>

      <button 
        onClick={() => setActivePanel(activePanel === 'whiteboard' ? 'none' : 'whiteboard')}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${activePanel === 'whiteboard' ? 'bg-[#FFD600]/15 text-[#FFD600] border border-[#FFD600]/30' : 'hover:bg-white/10'}`}
        title="Toggle Whiteboard"
      >
        <Palette className="w-5 h-5" />
      </button>

      <button 
        onClick={() => setActivePanel(activePanel === 'transcript' ? 'none' : 'transcript')}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${activePanel === 'transcript' ? 'bg-nexus-success/15 text-nexus-success border border-nexus-success/30' : 'hover:bg-white/10'}`}
        title="Live Transcript"
      >
        <ClosedCaption className="w-5 h-5" />
      </button>

      <div className="w-px h-8 bg-nexus-border mx-2" />

      {isHost && (
        <button 
          data-testid="end-for-all-btn"
          onClick={handleEndForAll}
          disabled={isEnding || isLeaving}
          className={`px-5 h-12 rounded-pill flex items-center justify-center gap-2 bg-nexus-danger hover:opacity-90 transition-opacity text-white font-medium text-sm border border-nexus-danger ${isEnding ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          {isEnding ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Ending...
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4" />
              End for All
            </>
          )}
        </button>
      )}

      <button 
        onClick={handleLeave}
        disabled={isLeaving || isEnding}
        className={`w-16 h-12 rounded-pill flex items-center justify-center bg-nexus-surface hover:bg-nexus-surfaceHover border border-nexus-border transition-colors text-nexus-danger ml-1 ${isLeaving ? 'opacity-70 cursor-not-allowed' : ''}`}
        title="Leave Meeting"
      >
        {isLeaving ? (
          <div className="w-4 h-4 border-2 border-nexus-danger border-t-transparent rounded-full animate-spin" />
        ) : (
          <PhoneOff className="w-5 h-5" />
        )}
      </button>

    </div>
  );
};

export default ControlBar;
