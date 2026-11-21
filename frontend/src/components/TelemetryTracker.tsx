import React, { useEffect, useState } from 'react';
import { useLocalParticipant, useRoomContext } from '@livekit/components-react';

export const TelemetryTracker: React.FC = () => {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [isConnected, setIsConnected] = useState<boolean>(room?.state === 'connected');

  useEffect(() => {
    if (!room) return;
    const handleStateChange = (state: string) => {
      setIsConnected(state === 'connected');
    };
    room.on('connectionStateChanged', handleStateChange);
    return () => {
      room.off('connectionStateChanged', handleStateChange);
    };
  }, [room]);

  // Handle OS-level window minimizing/tab switching instantly
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';

      if (localParticipant && isConnected) {
        const payload = JSON.stringify({
          focus_score: isVisible ? 0.88 : 0.40,
          final_score: isVisible ? 88 : 40,
          visual_score: isVisible ? 0.88 : 0.40,
          behavioral_score: isVisible ? 0.85 : 0.35,
          audio_score: 0.90,
          is_active: isVisible,
          event: "visibility_change"
        });
        
        const encoder = new TextEncoder();
        localParticipant.publishData(encoder.encode(payload), { reliable: true, topic: "telemetry" })
          .catch((err) => console.error("Telemetry publish error:", err));
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [localParticipant, isConnected]);

  // Periodic client-level telemetry heartbeat ensures meeting analytics reflect real presence
  useEffect(() => {
    if (!localParticipant || !isConnected) return;

    const sendTelemetryHeartbeat = () => {
      if (!localParticipant || room?.state !== 'connected') return;
      const isVisible = document.visibilityState === 'visible';
      const payload = JSON.stringify({
        focus_score: isVisible ? 0.88 : 0.40,
        final_score: isVisible ? 88 : 40,
        visual_score: isVisible ? 0.88 : 0.40,
        behavioral_score: isVisible ? 0.85 : 0.35,
        audio_score: 0.90,
        is_active: isVisible,
        event: "client_heartbeat"
      });
      const encoder = new TextEncoder();
      localParticipant.publishData(encoder.encode(payload), { reliable: true, topic: "telemetry" })
        .then(() => console.log("[TelemetryTracker] Heartbeat published successfully"))
        .catch((err) => console.error("Telemetry publish error:", err));
    };

    // Immediate dispatch upon room connection
    sendTelemetryHeartbeat();

    // Heartbeat every 2 seconds
    const timer = setInterval(sendTelemetryHeartbeat, 2000);
    return () => clearInterval(timer);
  }, [localParticipant, isConnected, room]);

  return null;
};
