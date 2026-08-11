import { useEffect, useRef, useState } from 'react';

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
 * Ultra Promax FaceMesh Hook
 * Implements real 10FPS limits, EMA smoothing (alpha=0.3), EAR blink rate,
 * and trigonometric yaw/pitch/roll equivalents for focus bounding.
 */
export const useFaceMesh = ({ stream, enabled, meetingId, token, userId }: UseFaceMeshProps) => {
  const [focusScore, setFocusScore] = useState<number>(100);
  const [isLookingAway, setIsLookingAway] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const faceMeshRef = useRef<InstanceType<typeof FaceMesh> | null>(null);
  
  // Tracking
  const lastFrameTimeRef = useRef<number>(0);
  const lastFaceDetectTimeRef = useRef<number>(0);
  const focusEmaRef = useRef<number>(100);
  const requestAnimationFrameRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled || !meetingId || !token) return;
    
    // In production, use wss:// and appropriate host
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
    if (!enabled || !stream || stream.getVideoTracks().length === 0) return;

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

    const faceMesh = new FaceMesh({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults((results: Results) => {
      const now = Date.now();
      
      if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        if (now - lastFaceDetectTimeRef.current > 3000) {
          // 3-second absence penalty drops score immediately to 0
          focusEmaRef.current = 0;
          setFocusScore(0);
          setIsLookingAway(true);
        }
        return;
      }

      lastFaceDetectTimeRef.current = now;
      const landmarks = results.multiFaceLandmarks[0];

      // 1. Head Pose (Trigonometric Pitch/Yaw/Roll)
      // Standard MP FaceMesh indices: Nose: 1, Left Eye: 33, Right Eye: 263, Chin: 152
      const nose = landmarks[1];
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      const chin = landmarks[152];

      // Yaw equivalent (Degrees)
      const dx = rightEye.x - leftEye.x;
      const nx = nose.x - leftEye.x;
      const yawDeg = ((nx / dx) - 0.5) * 100; // Approx mapping

      // Pitch equivalent (Degrees)
      const eyey = (leftEye.y + rightEye.y) / 2;
      const dy = chin.y - eyey;
      const ny = nose.y - eyey;
      const pitchDeg = ((ny / dy) - 0.5) * 100; // Approx mapping

      // Roll equivalent (Degrees)
      const dxd = rightEye.x - leftEye.x;
      const dyd = rightEye.y - leftEye.y;
      const rollDeg = Math.atan2(dyd, dxd) * (180 / Math.PI);

      // Compliance Bounds: Yaw ±15, Pitch ±10, Roll ±8
      let poseScore = 100;
      if (Math.abs(yawDeg) > 15) poseScore -= Math.abs(yawDeg) * 2;
      if (Math.abs(pitchDeg) > 10) poseScore -= Math.abs(pitchDeg) * 3;
      if (Math.abs(rollDeg) > 8) poseScore -= Math.abs(rollDeg) * 4;
      poseScore = Math.max(0, Math.min(100, poseScore));

      // 2. Blink Rate / Eye Aspect Ratio (EAR)
      // Left eye vertical landmarks: 159, 145. Horizontal: 33, 133
      const L_v1 = landmarks[159]; const L_v2 = landmarks[145];
      const L_h1 = landmarks[33];  const L_h2 = landmarks[133];
      const ear = Math.abs(L_v1.y - L_v2.y) / Math.abs(L_h1.x - L_h2.x);
      
      let blinkScore = 100;
      if (ear < 0.15) {
         // Extended eye closure
         blinkScore = 50; 
      }

      // 3. Composite Score (60% Pose, 40% Blink/Eyes)
      const rawScore = (poseScore * 0.6) + (blinkScore * 0.4);
      
      // 4. Exponential Moving Average Smoothing (Alpha = 0.3)
      const alpha = 0.3;
      focusEmaRef.current = (rawScore * alpha) + (focusEmaRef.current * (1 - alpha));
      
      const finalScore = Math.round(focusEmaRef.current);
      setFocusScore(finalScore);
      setIsLookingAway(finalScore < 60);

      // Send to backend for fusion if connected
      if (wsRef.current?.readyState === WebSocket.OPEN && userId && meetingId) {
        wsRef.current.send(JSON.stringify({
          meeting_id: meetingId,
          participant_id: userId,
          landmarks: landmarks
        }));
      }
    });

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
      console.error('FaceMesh failed to initialize:', err);
    });

    return () => {
      cancelAnimationFrame(requestAnimationFrameRef.current);
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream, enabled, meetingId, userId]);

  return { focusScore, isLookingAway };
};
