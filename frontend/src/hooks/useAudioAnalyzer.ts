import { useEffect, useRef, useState } from 'react';

interface UseAudioAnalyzerProps {
  stream: MediaStream | null;
  fftSize?: number;
  smoothingTimeConstant?: number;
}

/**
 * Pure calculation of RMS from time-domain audio samples centered at 128.
 * normalized = (sample - 128) / 128; sum(normalized^2) / N; sqrt
 */
export function calculateRms(dataArray: Uint8Array): number {
  if (dataArray.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const normalized = (dataArray[i] - 128) / 128;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / dataArray.length);
}

/**
 * Noise floor = max(min(recent 30 frames), 0.01)
 */
export function computeNoiseFloor(recentRmsHistory: number[]): number {
  if (recentRmsHistory.length === 0) return 0.01;
  const recent30 = recentRmsHistory.slice(-30);
  const minRecent = Math.min(...recent30);
  return Math.max(minRecent, 0.01);
}

/**
 * Threshold check: isSpeaking = rms > noise_floor * 2.5
 */
export function isSpeakingThreshold(rms: number, noiseFloor: number): boolean {
  return rms > noiseFloor * 2.5;
}

/**
 * Pure calculation of RMS, noise floor, and speaking status with hangover/debounce.
 */
export function calculateRmsAndSpeaking(
  dataArray: Uint8Array,
  recentRmsHistory: number[] = [],
  hangoverCounter: number = 0
): {
  rms: number;
  noiseFloor: number;
  isSpeaking: boolean;
  hangoverCounter: number;
} {
  const rms = calculateRms(dataArray);
  const noiseFloor = computeNoiseFloor(recentRmsHistory);
  const rawSpeaking = isSpeakingThreshold(rms, noiseFloor);

  let newHangover = hangoverCounter;
  let speaking = false;

  if (rawSpeaking) {
    speaking = true;
    newHangover = 3; // hangover debounce frames
  } else if (newHangover > 0) {
    speaking = true;
    newHangover -= 1;
  }

  return {
    rms,
    noiseFloor,
    isSpeaking: speaking,
    hangoverCounter: newHangover,
  };
}

/**
 * Ultra Promax Audio Analyzer Hook
 * Uses time-domain RMS data (analyser.fftSize), dynamic sliding noise floor tracking (recent 30 frames),
 * and 2.5x thresholding with hangover debounce.
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
  const hangoverRef = useRef<number>(0);

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

    // Buffer size must be analyser.fftSize, not frequencyBinCount
    const dataArray = new Uint8Array(analyser.fftSize);

    const updateVolume = () => {
      analyser.getByteTimeDomainData(dataArray);

      const { rms, isSpeaking: speakingNow, hangoverCounter } = calculateRmsAndSpeaking(
        dataArray,
        rmsHistoryRef.current,
        hangoverRef.current
      );
      hangoverRef.current = hangoverCounter;

      const normalizedVolume = Math.min(100, Math.max(0, rms * 100));
      setVolume(normalizedVolume);

      // Track recent 30 frames for dynamic noise floor
      rmsHistoryRef.current.push(rms);
      if (rmsHistoryRef.current.length > 30) {
        rmsHistoryRef.current.shift();
      }

      setIsSpeaking(speakingNow);

      if (speakingNow) {
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

  return { volume, isSpeaking, speakingDurationMs: speakingDurationMsRef.current };
};
