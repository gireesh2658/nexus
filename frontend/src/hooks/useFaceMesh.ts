import { useEffect, useRef, useState } from 'react';
declare const window: Record<string, unknown>;
interface IFaceMesh {
  setOptions: (options: unknown) => void;
  onResults: (callback: (results: Results) => void) => void;
  send: (params: { image: HTMLVideoElement }) => Promise<void>;
  close: () => void;
}
const FaceMesh = window.FaceMesh as unknown as new (options: unknown) => IFaceMesh;
const Camera = window.Camera as unknown as new (video: HTMLVideoElement, options: unknown) => { start: () => void; stop: () => void };

// We use 'unknown' for Results since the NPM types are removed to prevent Vite crashes
type Results = { multiFaceLandmarks?: { x: number; y: number }[][] };

interface UseFaceMeshProps {
  stream: MediaStream | null;
  enabled: boolean;
}

export const useFaceMesh = ({ stream, enabled }: UseFaceMeshProps) => {
  const [focusScore, setFocusScore] = useState<number>(100);
  const [isLookingAway, setIsLookingAway] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const faceMeshRef = useRef<InstanceType<typeof FaceMesh> | null>(null);
  const cameraRef = useRef<InstanceType<typeof Camera> | null>(null);

  useEffect(() => {
    if (!enabled || !stream || stream.getVideoTracks().length === 0) return;

    // Create a hidden video element to process the stream
    if (!videoRef.current) {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      video.play().catch(e => console.error('Error playing stream for FaceMesh:', e));
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
      if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        // No face detected -> dropping focus score quickly
        setFocusScore(prev => Math.max(0, prev - 5));
        setIsLookingAway(true);
        return;
      }

      const landmarks = results.multiFaceLandmarks[0];

      // Calculate Head Pose (Simplified)
      // Using nose tip, chin, left eye, right eye, left mouth corner, right mouth corner
      const nose = landmarks[1];
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];

      // Calculate yaw (left/right) based on horizontal distance of nose between eyes
      const eyeDistance = Math.abs(rightEye.x - leftEye.x);
      const noseToLeftEye = Math.abs(nose.x - leftEye.x);
      const yawRatio = noseToLeftEye / eyeDistance;

      // Calculate pitch (up/down) based on vertical distance
      const eyeCenterY = (leftEye.y + rightEye.y) / 2;
      const pitchDist = nose.y - eyeCenterY;
      
      // Focus Logic:
      // Ideal yawRatio is around 0.5 (nose perfectly between eyes). Deviation > 0.2 is looking away.
      // Ideal pitchDist is positive (nose below eyes). If it gets too small/negative, looking way up.
      const isYawBad = yawRatio < 0.3 || yawRatio > 0.7;
      const isPitchBad = pitchDist < 0.05 || pitchDist > 0.25;

      const currentlyLookingAway = isYawBad || isPitchBad;
      setIsLookingAway(currentlyLookingAway);

      if (currentlyLookingAway) {
        setFocusScore(prev => Math.max(0, prev - 2));
      } else {
        setFocusScore(prev => Math.min(100, prev + 1));
      }
    });

    faceMeshRef.current = faceMesh;

    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) {
          await faceMesh.send({ image: videoRef.current });
        }
      },
      width: 640,
      height: 480,
    });
    
    camera.start();
    cameraRef.current = camera;

    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream, enabled]);

  return { focusScore, isLookingAway };
};
