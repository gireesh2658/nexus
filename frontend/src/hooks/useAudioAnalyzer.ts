import { useEffect, useRef, useState } from 'react';

interface UseAudioAnalyzerProps {
  stream: MediaStream | null;
  fftSize?: number;
  smoothingTimeConstant?: number;
}

export const useAudioAnalyzer = ({
  stream,
  fftSize = 256,
  smoothingTimeConstant = 0.4,
}: UseAudioAnalyzerProps) => {
  const [volume, setVolume] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const animationRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

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
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);
      
      // Normalize volume from 0 to 100
      const normalizedVolume = Math.min(100, Math.max(0, (rms / 128) * 100));
      setVolume(normalizedVolume);
      
      // Dynamic noise floor baseline could be added here.
      // For now, a simple threshold of 10 out of 100 determines active speaking.
      setIsSpeaking(normalizedVolume > 10);

      animationRef.current = requestAnimationFrame(updateVolume);
    };

    updateVolume();

    return () => {
      cancelAnimationFrame(animationRef.current);
      if (sourceRef.current) sourceRef.current.disconnect();
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [stream, fftSize, smoothingTimeConstant]);

  return { volume, isSpeaking };
};
