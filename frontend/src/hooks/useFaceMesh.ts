import { useEffect, useRef, useState } from 'react';
import { FocusStateMachine } from '../utils/focusStateMachine';

declare const window: Record<string, unknown>;
interface IFaceMesh {
  setOptions: (options: unknown) => void;
  onResults: (callback: (results: Results) => void) => void;
  send: (params: { image: HTMLVideoElement }) => Promise<void>;
  close: () => void;
  initialize: () => Promise<void>;
}
const FaceMesh = window.FaceMesh as unknown as new (options: unknown) => IFaceMesh;

type Landmark = { x: number; y: number; z: number };
type Results = { multiFaceLandmarks?: Landmark[][] };

interface UseFaceMeshProps {
  stream: MediaStream | null;
  enabled: boolean;
  meetingId?: string;
  token?: string;
  userId?: string;
}

/**
 * Ultra Promax FaceMesh Hook with Temporal Stability & Hysteresis State Machine.
 * - Prevents false positive "Focus Lost" alerts on brief glances (~1s).
 * - Requires 2.5s sustained gaze away before confirming focus loss.
 * - Recovers automatically within 800ms when user returns gaze to screen.
 */
export const useFaceMesh = ({ stream, enabled, meetingId, token, userId }: UseFaceMeshProps) => {
  const [focusScore, setFocusScore] = useState<number>(100);
  const [isLookingAway, setIsLookingAway] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const faceMeshRef = useRef<InstanceType<typeof FaceMesh> | null>(null);
  const focusMachineRef = useRef<FocusStateMachine>(new FocusStateMachine());
  
  // Tracking
  const lastFrameTimeRef = useRef<number>(0);
  const requestAnimationFrameRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled || !meetingId || !token) return;
    
    const ws = new WebSocket(`ws://localhost:8000/api/focus/ws/frame`);
    
    ws.onopen = () => {
      ws.send(JSON.stringify({ token }));
    };
    
    ws.onerror = (err) => console.error('FaceMesh WS error:', err);
    
    wsRef.current = ws;
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [enabled, meetingId, token]);

  useEffect(() => {
    if (!enabled) {
      focusMachineRef.current.reset();
      setIsLookingAway(false);
      return;
    }

    const handleResults = (results: Results) => {
      const now = performance.now();
      
      if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        const res = focusMachineRef.current.processFrame(null, now);
        setFocusScore(res.focusScore);
        setIsLookingAway(res.isLookingAway);
        setIsUnavailable(res.isUnavailable);
        return;
      }

      const landmarks = results.multiFaceLandmarks[0];

      // 1. Head Pose (Trigonometric Pitch/Yaw/Roll)
      const nose = landmarks[1];
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      const chin = landmarks[152];

      // Yaw equivalent (Degrees)
      const dx = rightEye.x - leftEye.x;
      const nx = nose.x - leftEye.x;
      const yawDeg = dx ? ((nx / dx) - 0.5) * 100 : 0;

      // Pitch equivalent (Degrees)
      const eyey = (leftEye.y + rightEye.y) / 2;
      const dy = chin.y - eyey;
      const ny = nose.y - eyey;
      const pitchDeg = dy ? ((ny / dy) - 0.5) * 100 : 0;

      // Roll equivalent (Degrees)
      const dxd = rightEye.x - leftEye.x;
      const dyd = rightEye.y - leftEye.y;
      const rollDeg = dxd ? Math.atan2(dyd, dxd) * (180 / Math.PI) : 0;

      // Natural compliance bounds: Yaw ±28°, Pitch ±22°, Roll ±18°
      // Accommodates looking across screen or at notes without false penalties
      let poseScore = 100;
      if (Math.abs(yawDeg) > 28) poseScore -= (Math.abs(yawDeg) - 28) * 2.5;
      if (Math.abs(pitchDeg) > 22) poseScore -= (Math.abs(pitchDeg) - 22) * 3.0;
      if (Math.abs(rollDeg) > 18) poseScore -= (Math.abs(rollDeg) - 18) * 3.0;
      poseScore = Math.max(0, Math.min(100, poseScore));

      // 2. Blink Rate / Eye Aspect Ratio (EAR)
      const L_v1 = landmarks[159]; const L_v2 = landmarks[145];
      const L_h1 = landmarks[33];  const L_h2 = landmarks[133];
      const earDx = Math.abs(L_h1.x - L_h2.x);
      const ear = earDx ? Math.abs(L_v1.y - L_v2.y) / earDx : 0;
      
      let eyeScore = 100;
      if (ear < 0.12) {
         eyeScore = 55;
      }

      // 3. Composite Frame Score (70% Pose, 30% Eye)
      const rawScore = (poseScore * 0.7) + (eyeScore * 0.3);
      
      // 4. Feed into Temporal State Machine (Hysteresis & Grace Period)
      const res = focusMachineRef.current.processFrame(rawScore, now);
      setFocusScore(res.focusScore);
      setIsLookingAway(res.isLookingAway);
      setIsUnavailable(res.isUnavailable);

      // Send to backend for fusion if connected
      if (wsRef.current?.readyState === WebSocket.OPEN && userId && meetingId) {
        wsRef.current.send(JSON.stringify({
          meeting_id: meetingId,
          participant_id: userId,
          landmarks: landmarks,
          focus_score: res.focusScore,
          is_looking_away: res.isLookingAway
        }));
      }

      return res;
    };

    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      (window as any).__nexus_simulate_landmarks = handleResults;
    }

    if (!stream || stream.getVideoTracks().length === 0) {
      return () => {
        if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
          if ((window as any).__nexus_simulate_landmarks === handleResults) {
            delete (window as any).__nexus_simulate_landmarks;
          }
        }
      };
    }

    if (!videoRef.current) {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      video.play().catch(e => console.error('Error playing stream:', e));
      videoRef.current = video;
    } else {
      videoRef.current.srcObject = stream;
    }

    const FaceMeshClass = (window as any).FaceMesh;
    if (FaceMeshClass) {
      try {
        const faceMesh = new FaceMeshClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceMesh.onResults(handleResults);
        faceMeshRef.current = faceMesh;

        // Custom 10FPS execution loop
        const processFrame = async () => {
          const now = performance.now();
          if (now - lastFrameTimeRef.current >= 100) { // 100ms = 10 FPS
             lastFrameTimeRef.current = now;
             if (videoRef.current && videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0) {
               try {
                 await faceMeshRef.current?.send({ image: videoRef.current });
               } catch (err) {
                 console.error('FaceMesh tracking error:', err);
               }
             }
          }
          requestAnimationFrameRef.current = requestAnimationFrame(processFrame);
        };

        // Initialize before processing
        faceMesh.initialize().then(() => {
          processFrame();
        }).catch((err: unknown) => {
          console.warn('FaceMesh failed to initialize:', err);
        });
      } catch (err) {
        console.warn('Error instantiating FaceMesh:', err);
      }
    }

    return () => {
      cancelAnimationFrame(requestAnimationFrameRef.current);
      if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
        if ((window as any).__nexus_simulate_landmarks === handleResults) {
          delete (window as any).__nexus_simulate_landmarks;
        }
      }
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream?.getVideoTracks()[0]?.id, enabled, meetingId, userId]);

  return { focusScore, isLookingAway, isUnavailable };
};
