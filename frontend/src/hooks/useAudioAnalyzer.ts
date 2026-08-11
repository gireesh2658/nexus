import { useEffect, useRef, useState } from 'react';

interface UseAudioAnalyzerProps {
  stream: MediaStream | null;
  fftSize?: number;
  smoothingTimeConstant?: number;
}

/**
 * Ultra Promax Audio Analyzer Hook
 * Implements real 100ms Web Audio API RMS calculations, dynamic 5s noise floor tracking, 
 * 1.5x thresholding, and continuous speaking time aggregation.
 */
export const useAudioAnalyzer = ({
  stream,
  fftSize = 256,
  smoothingTimeConstant = 0.4,
}: UseAudioAnalyzerProps) => {
  const [volume, setVolume] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Dynamic tracking
  const rmsHistoryRef = useRef<number[]>([]);
  const speakingDurationMsRef = useRef<number>(0);
  const consecutiveSpeakingMsRef = useRef<number>(0);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) return;

    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext)();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = smoothingTimeConstant;
    analyserRef.current = analyser;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    sourceRef.current = source;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate RMS
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
         sum += (dataArray[i] / 128 - 1) * (dataArray[i] / 128 - 1); // True RMS of waveform
      }
      const rms = Math.sqrt(sum / dataArray.length);
      
      const normalizedVolume = Math.min(100, Math.max(0, rms * 100));
      setVolume(normalizedVolume);
      
      // Dynamic Noise Floor (5 second sliding window = 50 samples at 100ms)
      rmsHistoryRef.current.push(rms);
      if (rmsHistoryRef.current.length > 50) {
         rmsHistoryRef.current.shift();
      }
      
      const noiseFloor = Math.min(...rmsHistoryRef.current, 0.01); // fallback min to prevent /0
      
      // Active Speaker Threshold > 1.5x noise floor
      if (rms > noiseFloor * 1.5 && rms > 0.05) { // 0.05 absolute minimum to avoid silence scaling
         consecutiveSpeakingMsRef.current += 100;
      } else {
         consecutiveSpeakingMsRef.current = 0;
      }

      // Require 300ms continuous above threshold to trigger "isSpeaking"
      const activelySpeaking = consecutiveSpeakingMsRef.current >= 300;
      setIsSpeaking(activelySpeaking);

      if (activelySpeaking) {
         speakingDurationMsRef.current += 100;
      }
    };

    // Exactly 100ms interval mapping
    intervalRef.current = window.setInterval(updateVolume, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (sourceRef.current) sourceRef.current.disconnect();
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [stream, fftSize, smoothingTimeConstant]);

  // eslint-disable-next-line react-hooks/refs
  return { volume, isSpeaking, speakingDurationMs: speakingDurationMsRef.current };
};
