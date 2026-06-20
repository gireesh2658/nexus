import { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';

interface UseEmotionDetectionProps {
  stream: MediaStream | null;
  enabled: boolean;
  intervalMs?: number;
}

export type Emotion = 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'neutral';

export const useEmotionDetection = ({
  stream,
  enabled,
  intervalMs = 3000,
}: UseEmotionDetectionProps) => {
  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Load models on mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        // Models need to be served from public directory or CDN
        const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
        ]);
        setIsModelsLoaded(true);
      } catch (err) {
        console.error('Failed to load face-api models', err);
      }
    };
    loadModels();
  }, []);

  useEffect(() => {
    if (!enabled || !isModelsLoaded || !stream || stream.getVideoTracks().length === 0) return;

    if (!videoRef.current) {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      video.play().catch(e => console.error('Error playing stream for FaceAPI:', e));
      videoRef.current = video;
    } else {
      videoRef.current.srcObject = stream;
    }

    const detectEmotion = async () => {
      if (!videoRef.current) return;
      
      const detections = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceExpressions();

      if (detections) {
        // Find dominant emotion
        const expressions = detections.expressions;
        const dominantEmotion = Object.keys(expressions).reduce((a, b) => 
          expressions[a as keyof faceapi.FaceExpressions] > expressions[b as keyof faceapi.FaceExpressions] ? a : b
        ) as Emotion;
        
        setEmotion(dominantEmotion);
      }
    };

    intervalRef.current = setInterval(detectEmotion, intervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [stream, enabled, isModelsLoaded, intervalMs]);

  return { emotion, isModelsLoaded };
};
