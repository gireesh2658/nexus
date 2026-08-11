import { useEffect, useRef, useCallback } from 'react';
import { FaceMesh, type Results } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';

export function useMediaPipe(
  videoElement: React.RefObject<HTMLVideoElement | null>,
  onResults: (results: Results) => void
) {
  const faceMeshRef = useRef<FaceMesh | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const lastInferenceTime = useRef<number>(0);

  // Memoize the callback to prevent unnecessary re-initializations
  const handleResults = useCallback(
    (results: Results) => {
      onResults(results);
    },
    [onResults]
  );

  useEffect(() => {
    if (!videoElement.current) return;

    // Initialize FaceMesh using free CDN for WASM binaries
    const faceMesh = new FaceMesh({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
      },
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true, // Essential for accurate eye/iris tracking
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults(handleResults);
    faceMeshRef.current = faceMesh;

    // Initialize Camera to feed frames to FaceMesh
    const camera = new Camera(videoElement.current, {
      onFrame: async () => {
        const now = Date.now();
        // CPU Optimization: Throttle WASM inference to 0.5Hz (once every 2 seconds).
        // This explicitly drops 29 out of 30 frames per second, preventing the local
        // machine's CPU/battery from being starved by constant MediaPipe execution.
        if (now - lastInferenceTime.current >= 2000) {
          if (videoElement.current && faceMeshRef.current) {
            await faceMeshRef.current.send({ image: videoElement.current });
            lastInferenceTime.current = now;
          }
        }
      },
      width: 640,
      height: 480,
    });
    
    camera.start();
    cameraRef.current = camera;

    // Memory-safe cleanup function to prevent memory leaks when unmounting
    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
      }
    };
  }, [videoElement, handleResults]);
}
