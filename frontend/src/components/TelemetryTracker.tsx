import React, { useRef, useCallback, useEffect } from 'react';
import { useMediaPipe } from '../hooks/useMediaPipe';
import type { Results } from '@mediapipe/face_mesh';
import { useLocalParticipant } from '@livekit/components-react';

export const TelemetryTracker: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { localParticipant } = useLocalParticipant();

  // Handle OS-level window minimizing/tab switching instantly
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';

      if (localParticipant) {
        const payload = JSON.stringify({
          is_active: isVisible,
          event: "visibility_change"
        });
        
        // Use reliable: true for state changes so we guarantee delivery
        const encoder = new TextEncoder();
        localParticipant.publishData(encoder.encode(payload), { reliable: true, topic: "telemetry" });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [localParticipant]);

  const calculateFocusScore = (landmarks: Array<{x: number; y: number}>) => {
    if (!landmarks || landmarks.length === 0) return 0;

    const leftEyeTop = landmarks[159];
    const leftEyeBottom = landmarks[145];
    const leftEyeLeft = landmarks[33];
    const leftEyeRight = landmarks[133];

    const verticalDist = Math.hypot(leftEyeTop.x - leftEyeBottom.x, leftEyeTop.y - leftEyeBottom.y);
    const horizontalDist = Math.hypot(leftEyeLeft.x - leftEyeRight.x, leftEyeLeft.y - leftEyeRight.y);

    const ear = horizontalDist > 0 ? verticalDist / horizontalDist : 0;
    const normalizedScore = Math.min(Math.max((ear - 0.2) / 0.1, 0), 1.0);
    return parseFloat(normalizedScore.toFixed(2));
  };

  const handleMediaPipeResults = useCallback((results: Results) => {
    // The WASM inference is now pre-throttled to 2000ms by the hook.
    // We process exactly what we receive.
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      const focusScore = calculateFocusScore(landmarks);

      // Merge with visibility state to prevent false positives if camera freezes in background
      const isVisible = document.visibilityState === 'visible';
      const isActive = focusScore > 0.3 && isVisible; 

      if (localParticipant) {
        const payload = JSON.stringify({
          focus_score: focusScore,
          is_active: isActive,
          event: "periodic_update"
        });
        
        // Use reliable: false for high-freq periodic updates (UDP behavior)
        const encoder = new TextEncoder();
        localParticipant.publishData(encoder.encode(payload), { reliable: false, topic: "telemetry" });
      }
    }
  }, [localParticipant]);

  useMediaPipe(videoRef, handleMediaPipeResults);

  return (
    <div style={{ display: 'none' }}>
      <video ref={videoRef} autoPlay playsInline />
    </div>
  );
};
