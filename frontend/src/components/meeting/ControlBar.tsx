import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, MessageSquare, Palette, Smile, ClosedCaption, XCircle } from 'lucide-react';
import { Track } from 'livekit-client';
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
  const token = localStorage.getItem('token') || '';
  
  // Start transcribing local audio when mic is enabled
  const micPublication = localParticipant?.getTrackPublication(Track.Source.Microphone);
  const audioTrack = micPublication?.track?.mediaStreamTrack;
  const stream = audioTrack ? new MediaStream([audioTrack]) : null;
  
  useTranscription(meetingId || '', isMicrophoneEnabled, stream, token, user?._id || '');

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
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 rounded-pill matte-overlay z-50">
      
      <button 
        onClick={toggleMic}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${!isMicrophoneEnabled ? 'bg-nexus-danger/15 text-nexus-danger border border-nexus-danger/30' : 'hover:bg-white/10'}`}
      >
        {!isMicrophoneEnabled ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </button>

      <button 
        onClick={toggleCamera}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${!isCameraEnabled ? 'bg-nexus-danger/15 text-nexus-danger border border-nexus-danger/30' : 'hover:bg-white/10'}`}
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
        >
          <Smile className="w-5 h-5" />
        </button>
      </div>

      <button 
        onClick={toggleScreenShare}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isScreenShareEnabled ? 'bg-nexus-primary/15 text-nexus-primary border border-nexus-primary/30' : 'hover:bg-white/10'}`}
      >
        <MonitorUp className="w-5 h-5" />
      </button>

      <button 
        onClick={() => setActivePanel('chat')}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${activePanel === 'chat' ? 'bg-nexus-cyan/15 text-nexus-cyan border border-nexus-cyan/30' : 'hover:bg-white/10'}`}
      >
        <MessageSquare className="w-5 h-5" />
      </button>

      <button 
        onClick={() => setActivePanel('whiteboard')}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${activePanel === 'whiteboard' ? 'bg-[#FFD600]/15 text-[#FFD600] border border-[#FFD600]/30' : 'hover:bg-white/10'}`}
      >
        <Palette className="w-5 h-5" />
      </button>

      <button 
        onClick={() => setActivePanel('transcript')}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${activePanel === 'transcript' ? 'bg-nexus-success/15 text-nexus-success border border-nexus-success/30' : 'hover:bg-white/10'}`}
        title="Live Transcript"
      >
        <ClosedCaption className="w-5 h-5" />
      </button>

      <div className="w-px h-8 bg-nexus-border mx-2" />

      {isHost && (
        <button 
          onClick={handleEndForAll}
          className="px-5 h-12 rounded-pill flex items-center justify-center gap-2 bg-nexus-danger hover:opacity-90 transition-opacity text-white font-medium text-sm border border-nexus-danger"
        >
          <XCircle className="w-4 h-4" />
          End for All
        </button>
      )}

      <button 
        onClick={handleLeave}
        className="w-16 h-12 rounded-pill flex items-center justify-center bg-nexus-surface hover:bg-nexus-surfaceHover border border-nexus-border transition-colors text-nexus-danger ml-1"
        title="Leave Meeting"
      >
        <PhoneOff className="w-5 h-5" />
      </button>

    </div>
  );
};

export default ControlBar;
