import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMeetingAI } from '../../hooks/useMeetingAI';
import { Brain, Volume2, MicOff, AlertCircle } from 'lucide-react';

interface VideoTileProps {
  stream?: MediaStream | null;
  name: string;
  userId: string;
  isLocal?: boolean;
  isMuted?: boolean;
  score?: number;
}

import { socketService } from '../../services/socket';

const VideoTile: React.FC<VideoTileProps> = ({ stream, name, userId, isLocal, isMuted, score }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeReactions, setActiveReactions] = React.useState<{ id: number; emoji: string }[]>([]);
  
  // Only run AI if this is the local tile
  const aiStats = useMeetingAI({ stream: stream || null, enabled: !!isLocal });

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

  // Determine ring color based on score
  const getScoreColor = () => {
    if (displayScore === undefined) return 'border-nexus-border';
    if (displayScore >= 70) return 'border-nexus-success shadow-[0_0_15px_rgba(0,230,118,0.3)]';
    if (displayScore >= 40) return 'border-nexus-warning shadow-[0_0_15px_rgba(255,214,0,0.3)]';
    return 'border-nexus-danger shadow-[0_0_15px_rgba(255,82,82,0.3)]';
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`relative rounded-2xl overflow-hidden bg-black/60 border-2 ${getScoreColor()} aspect-video flex items-center justify-center group`}
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
        <div className="w-20 h-20 rounded-full bg-nexus-primary/20 flex items-center justify-center text-3xl font-bold text-nexus-primary">
          {name.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Local AI overlay (only visible for local user) */}
      {isLocal && (
        <div className="absolute top-3 right-3 flex flex-col gap-2 z-10">
          <div className="px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[10px] font-medium flex items-center gap-1.5 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
            <Brain className="w-3 h-3 text-nexus-primary" />
            <span className="text-white/80">Focus: {aiStats.focusScore}%</span>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[10px] font-medium flex items-center gap-1.5 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity capitalize">
            {aiStats.emotion === 'happy' ? '😊' : aiStats.emotion === 'neutral' ? '😐' : '🤔'}
            <span className="text-white/80">{aiStats.emotion}</span>
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
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-nexus-danger/90 backdrop-blur-md px-4 py-2 rounded-xl text-white text-sm font-bold flex items-center gap-2 border border-white/20 shadow-xl z-20"
          >
            <AlertCircle className="w-4 h-4" />
            Focus Lost
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice Activity indicator */}
      {isLocal && aiStats.isSpeaking && (
        <div className="absolute top-3 left-3 px-2 py-1.5 rounded-lg bg-nexus-success/90 text-white text-xs font-bold flex items-center gap-1.5 animate-pulse shadow-lg z-10">
          <Volume2 className="w-3.5 h-3.5" />
        </div>
      )}

      {/* Overlay details */}
      <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center z-10">
        <div className="px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-md text-sm font-medium flex items-center gap-2 border border-white/10">
          <span>{name} {isLocal && '(You)'}</span>
          {(isMuted || (isLocal && !aiStats.isSpeaking)) && (
            <MicOff className="w-3.5 h-3.5 text-nexus-danger" />
          )}
        </div>
        
        {displayScore !== undefined && (
          <div className="px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-md text-sm font-bold border border-white/10 font-mono flex items-center gap-1">
            <span className="text-[10px] text-white/50 uppercase tracking-wider mr-1">ENG:</span>
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
