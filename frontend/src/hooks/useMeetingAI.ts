import { useEffect, useState, useRef } from 'react';
import { useAudioAnalyzer } from './useAudioAnalyzer';
import { useFaceMesh } from './useFaceMesh';
import { useEmotionDetection, type Emotion } from './useEmotionDetection';

interface UseMeetingAIProps {
  stream: MediaStream | null;
  enabled: boolean;
  actualStartTime?: Date | null;
  meetingId?: string;
  token?: string;
  userId?: string;
}

export interface AIEngagementStats {
  focusScore: number;
  emotion: Emotion;
  isSpeaking: boolean;
  engagementScore: number;
  isLookingAway: boolean;
  volume: number;
}

export const useMeetingAI = ({ stream, enabled, actualStartTime }: UseMeetingAIProps): AIEngagementStats => {
  const { volume, isSpeaking, speakingDurationMs } = useAudioAnalyzer({ stream });
  const { focusScore, isLookingAway } = useFaceMesh({ stream, enabled });
  const { emotion } = useEmotionDetection({ stream, enabled });
  
  const [engagementScore, setEngagementScore] = useState(100);
  const engagementEmaRef = useRef(100);

  // Map emotions to engaged/disengaged mapped score (0-100)
  const getEmotionScore = (e: Emotion): number => {
    switch (e) {
      case 'happy': 
      case 'surprised': 
        return 100; // Engaged
      case 'neutral': 
        return 60; // Neutral
      case 'sad': 
      case 'fearful': 
        return 30; // Disengaged
      case 'angry': 
      case 'disgusted': 
        return 10; // Negative
      default: 
        return 50;
    }
  };

  useEffect(() => {
    if (!enabled) return;

    // Calculate composite engagement score every 10 seconds as requested
    const interval = setInterval(() => {
      const wFocus = 0.35;
      const wEmotion = 0.20;
      const wSpeaking = 0.25;
      const wCamera = 0.20;

      const emotionScore = getEmotionScore(emotion);
      const cameraScore = (stream && stream.getVideoTracks().length > 0) ? 100 : 0;

      // Speaking Ratio Calculation
      let speakingScore = 0;
      if (actualStartTime) {
        const totalElapsedMs = Date.now() - new Date(actualStartTime).getTime();
        if (totalElapsedMs > 0) {
           const ratio = speakingDurationMs / totalElapsedMs;
           // Cap at 40% (0.4). So 0.4 ratio = 100 score.
           speakingScore = Math.min(100, (ratio / 0.4) * 100);
        }
      }

      const rawComposite = 
        (focusScore * wFocus) + 
        (emotionScore * wEmotion) + 
        (speakingScore * wSpeaking) + 
        (cameraScore * wCamera);

      // Exponential Moving Average smoothing (Alpha = 0.3)
      const alpha = 0.3;
      engagementEmaRef.current = (rawComposite * alpha) + (engagementEmaRef.current * (1 - alpha));

      setEngagementScore(Math.round(engagementEmaRef.current));

    }, 10000);

    return () => clearInterval(interval);
  }, [focusScore, emotion, isSpeaking, speakingDurationMs, enabled, actualStartTime, stream]);

  return {
    focusScore,
    emotion,
    isSpeaking,
    engagementScore,
    isLookingAway,
    volume
  };
};
