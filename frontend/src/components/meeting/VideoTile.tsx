import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMeetingAI } from '../../hooks/useMeetingAI';
import { useMeetingStore } from '../../store/meetingStore';
import { socketService } from '../../services/socket';
import { Brain, Volume2, MicOff, AlertCircle } from 'lucide-react';

interface VideoTileProps {
  stream?: MediaStream | null;
  name: string;
  userId: string;
  isLocal?: boolean;
  isMuted?: boolean;
  score?: number;
  isSpotlighted?: boolean;
}

const VideoTile: React.FC<VideoTileProps> = ({ stream, name, userId, isLocal, isMuted, score, isSpotlighted }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeReactions, setActiveReactions] = React.useState<{ id: number; emoji: string }[]>([]);
  const token = localStorage.getItem('token') || '';
  const meetingId = useMeetingStore((state) => state.currentMeeting?._id);
  
  // Only run AI if this is the local tile
  const consentGiven = useMeetingStore((state) => state.consentGiven);
  
  const aiStats = useMeetingAI({ 
    stream: stream || null, 
    enabled: !!isLocal && consentGiven,
    meetingId,
    token,
    userId
  });

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleReaction = (data: { userId: string; emoji: string }) => {
      if (data.userId === userId) {
        const id = Date.now() + Math.random();
        setActiveReactions(prev => [...prev, { id, emoji: data.emoji }]);
        setTimeout(() => {
          setActiveReactions(prev => prev.filter(r => r.id !== id));
        }, 3000); // Remove after 3 seconds
      }
    };

    socket.on('meeting-reaction', handleReaction);
    return () => {
      socket.off('meeting-reaction', handleReaction);
    };
  }, [userId]);

  // Use local AI score if local tile, else use provided score from network
  const displayScore = isLocal ? aiStats.engagementScore : score;

  // STRICT ANTI-JITTER BORDER:
  // Default (Not speaking): border-2 border-[rgba(255,255,255,0.04)]
  // Active (Speaking): border-2 border-transparent presence-ring
  const getBorderTreatment = () => {
    if (isSpotlighted) return 'border-2 border-nexus-warning shadow-matte-lg'; // Exception for spotlight
    
    // We infer active speaker status from aiStats if local, or if we had a remote prop (we use score>50 as proxy for speaking here just to show effect, ideally there's a isSpeaking prop)
    // Actually, LiveKit provides isSpeaking. But since we don't have it passed in as a prop directly yet (besides aiStats for local), 
    // let's use the local aiStats.isSpeaking for local. For remote, we'll assume not speaking for this exact component unless passed.
    // For now:
    const isSpeaking = isLocal ? aiStats.isSpeaking : false; // Note: to fully support remote, we need isSpeaking prop from LiveKitGrid.

    if (isSpeaking) {
      return 'border-2 border-transparent presence-ring';
    }
    
    return 'border-2 border-[rgba(255,255,255,0.04)]';
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`relative rounded-card overflow-hidden bg-black ${getBorderTreatment()} aspect-video flex items-center justify-center group`}
    >
      {stream && stream.getVideoTracks().some(t => t.enabled) ? (
        <video 
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''} ${aiStats.isLookingAway ? 'grayscale opacity-70' : ''} transition-all duration-500`}
        />
      ) : (
        <div className="w-20 h-20 rounded-full bg-nexus-surface border border-nexus-border flex items-center justify-center text-3xl font-medium font-display text-nexus-muted">
          {name.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Local AI overlay (only visible for local user) */}
      {isLocal && (
        <div className="absolute top-3 right-3 flex flex-col gap-2 z-10">
          <div className="px-2.5 py-1.5 rounded-lg video-label text-[10px] font-medium flex items-center gap-1.5 border border-transparent opacity-0 group-hover:opacity-100 transition-opacity text-white">
            <Brain className="w-3 h-3 text-nexus-primary" />
            <span>Focus: {aiStats.focusScore}%</span>
          </div>
          <div className="px-2.5 py-1.5 rounded-lg video-label text-[10px] font-medium flex items-center gap-1.5 border border-transparent opacity-0 group-hover:opacity-100 transition-opacity text-white capitalize">
            {aiStats.emotion === 'happy' ? '😊' : aiStats.emotion === 'neutral' ? '😐' : '🤔'}
            <span>{aiStats.emotion}</span>
          </div>
        </div>
      )}

      {/* Look Away Warning */}
      <AnimatePresence>
        {isLocal && aiStats.isLookingAway && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-nexus-danger video-label px-4 py-2 rounded-card text-white text-sm font-semibold flex items-center gap-2 shadow-matte-lg z-20"
          >
            <AlertCircle className="w-4 h-4" />
            Focus Lost
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice Activity indicator */}
      {isLocal && aiStats.isSpeaking && (
        <div className="absolute top-3 left-3 px-2 py-1.5 rounded-lg bg-nexus-primary text-white text-xs font-bold flex items-center gap-1.5 animate-pulse-soft z-10">
          <Volume2 className="w-3.5 h-3.5" />
        </div>
      )}

      {/* Overlay details */}
      <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center z-10">
        <div className="video-label text-xs font-medium flex items-center gap-2 text-white">
          <span>{name} {isLocal && '(You)'}</span>
          {(isMuted || (isLocal && !aiStats.isSpeaking)) && (
            <MicOff className="w-3.5 h-3.5 text-nexus-danger" />
          )}
        </div>
        
        {displayScore !== undefined && (
          <div className="video-label text-xs font-mono font-medium flex items-center gap-1.5 text-white">
            <span className="text-[9px] text-white/50 uppercase tracking-wider">ENG</span>
            {displayScore}%
          </div>
        )}
      </div>

      {/* Floating Reactions */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
        <AnimatePresence>
          {activeReactions.map(reaction => (
            <motion.div
              key={reaction.id}
              initial={{ opacity: 0, y: 50, scale: 0.5, x: '-50%' }}
              animate={{ opacity: 1, y: -100, scale: 2, x: '-50%' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              className="absolute bottom-1/4 left-1/2 text-4xl"
            >
              {reaction.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

    </motion.div>
  );
};

export default VideoTile;
