import React, { useEffect, useState } from 'react';
import { useTracks, useLocalParticipant, type TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { Track } from 'livekit-client';
import VideoTile from './VideoTile';
import { socketService } from '../../services/socket';

const LiveKitGrid: React.FC = () => {
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false }
  );

  const screenTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false }
  );

  const { localParticipant } = useLocalParticipant();
  const [spotlightedUserId, setSpotlightedUserId] = useState<string | null>(null);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleSpotlight = (data: { spotlightedUserId: string | null }) => {
      setSpotlightedUserId(data.spotlightedUserId);
    };

    socket.on('spotlight-changed', handleSpotlight);
    return () => {
      socket.off('spotlight-changed', handleSpotlight);
    };
  }, []);

  const hasScreenShare = screenTracks.length > 0;
  
  // Find spotlighted track if it exists
  const spotlightedTrack = spotlightedUserId 
    ? cameraTracks.find(t => t.participant.identity === spotlightedUserId)
    : null;

  const renderTrack = (trackRef: TrackReferenceOrPlaceholder, isDominant: boolean = false) => {
    const isLocal = trackRef.participant.identity === localParticipant.identity;
    const name = trackRef.participant.name || trackRef.participant.identity;
    const isSpotlighted = trackRef.participant.identity === spotlightedUserId;
    
    let stream: MediaStream | null = null;
    if (trackRef.publication?.track?.mediaStreamTrack) {
      stream = new MediaStream([trackRef.publication.track.mediaStreamTrack]);
    }
    
    return (
      <div key={`${trackRef.participant.identity}-${trackRef.source}`} className={`${isDominant ? 'w-full h-full' : 'w-full h-full'}`}>
        <VideoTile
          stream={stream}
          name={isDominant && hasScreenShare ? `${name}'s Screen` : name}
          userId={trackRef.participant.identity}
          isLocal={isLocal && !hasScreenShare}
          isMuted={trackRef.publication?.isMuted}
          score={undefined} 
          isSpotlighted={isSpotlighted}
        />
      </div>
    );
  };

  // 1. Screen Share takes highest precedence
  if (hasScreenShare) {
    return (
      <div className="w-full h-full flex flex-col p-4 gap-4">
        <div className="flex-1 w-full bg-black rounded-card overflow-hidden border-2 border-nexus-border shadow-matte-lg">
          {renderTrack(screenTracks[0], true)}
        </div>
        
        <div className="h-48 w-full flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10">
          {cameraTracks.map(t => (
            <div key={`${t.participant.identity}-${t.source}`} className="h-full w-auto aspect-video shrink-0">
              {renderTrack(t)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 2. Spotlight takes second precedence
  if (spotlightedTrack) {
    const otherTracks = cameraTracks.filter(t => t.participant.identity !== spotlightedUserId);
    
    return (
      <div className="w-full h-full flex flex-col p-4 gap-4">
        <div className="flex-1 w-full bg-black rounded-card overflow-hidden border-2 border-nexus-warning shadow-matte-lg">
          {renderTrack(spotlightedTrack, true)}
        </div>
        
        {otherTracks.length > 0 && (
          <div className="h-48 w-full flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10">
            {otherTracks.map(t => (
              <div key={`${t.participant.identity}-${t.source}`} className="h-full w-auto aspect-video shrink-0">
                {renderTrack(t)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 3. Regular Grid
  const totalTiles = cameraTracks.length;
  let gridClass = 'grid-cols-1';
  if (totalTiles >= 2) gridClass = 'grid-cols-1 sm:grid-cols-2';
  if (totalTiles >= 5) gridClass = 'grid-cols-2 lg:grid-cols-3';

  return (
    <div className={`grid ${gridClass} gap-4 w-full h-full content-center p-4`}>
      {cameraTracks.map(t => renderTrack(t))}
    </div>
  );
};

export default LiveKitGrid;
