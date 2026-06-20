import { useEffect, useState } from 'react';
import { useAudioAnalyzer } from './useAudioAnalyzer';
import { useFaceMesh } from './useFaceMesh';
import { useEmotionDetection, type Emotion } from './useEmotionDetection';

interface UseMeetingAIProps {
  stream: MediaStream | null;
  enabled: boolean;
}

export interface AIEngagementStats {
  focusScore: number;
  emotion: Emotion;
  isSpeaking: boolean;
  engagementScore: number;
  isLookingAway: boolean;
  volume: number;
}

export const useMeetingAI = ({ stream, enabled }: UseMeetingAIProps): AIEngagementStats => {
  const { volume, isSpeaking } = useAudioAnalyzer({ stream });
  const { focusScore, isLookingAway } = useFaceMesh({ stream, enabled });
  const { emotion } = useEmotionDetection({ stream, enabled });
  
  const [engagementScore, setEngagementScore] = useState(100);

  // Map emotions to a positivity score (0 to 100)
  const getEmotionScore = (e: Emotion): number => {
    switch (e) {
      case 'happy': return 100;
      case 'surprised': return 80;
      case 'neutral': return 60;
      case 'fearful': return 40;
      case 'sad': return 30;
      case 'angry': return 20;
      case 'disgusted': return 10;
      default: return 50;
    }
  };

  useEffect(() => {
    if (!enabled) return;

    // Calculate composite engagement score every 3 seconds
    const interval = setInterval(() => {
      // Weightings based on the Ultra Promax prompt:
      // Focus: 35%, Emotion: 20%, Speaking: 25%, Camera On: 20%
      // (Since we have a stream if this hook is running, Camera is assumed On = 100)
      
      const wFocus = 0.35;
      const wEmotion = 0.20;
      const wSpeaking = 0.25;
      const wCamera = 0.20;

      const emotionScore = getEmotionScore(emotion);
      const speakingScore = isSpeaking ? 100 : 30; // 30 is baseline for actively listening

      const composite = 
        (focusScore * wFocus) + 
        (emotionScore * wEmotion) + 
        (speakingScore * wSpeaking) + 
        (100 * wCamera);

      setEngagementScore(Math.round(composite));

    }, 3000);

    return () => clearInterval(interval);
  }, [focusScore, emotion, isSpeaking, enabled]);

  return {
    focusScore,
    emotion,
    isSpeaking,
    engagementScore,
    isLookingAway,
    volume
  };
};
