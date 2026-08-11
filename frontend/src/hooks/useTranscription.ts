import { useEffect, useRef, useState } from 'react';

export const useTranscription = (meetingId: string, isMicEnabled: boolean, stream: MediaStream | null, token: string, userId: string) => {
  const [localTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!meetingId || !token || !userId) return;

    // Connect to backend audio analysis WebSocket
    const ws = new WebSocket(`ws://localhost:8000/api/audio/ws/chunks`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ token }));
    };
    ws.onerror = (e) => console.error('Audio WS error:', e);
    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [meetingId, token, userId]);

  useEffect(() => {
    if (isMicEnabled && stream && stream.getAudioTracks().length > 0) {
      try {
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
        
        recorder.ondataavailable = async (e) => {
          if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
            // Convert blob to base64 in 8KB chunks to avoid RangeError
            const buffer = await e.data.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
              binary += String.fromCharCode.apply(null, Array.from(slice));
            }
            const base64data = btoa(binary);
            
            wsRef.current.send(JSON.stringify({
              meeting_id: meetingId,
              participant_id: userId,
              audio_data: base64data
            }));
          }
        };

        // Capture chunks every 10 seconds
        recorder.start(10000);
        mediaRecorderRef.current = recorder;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsListening(true);
      } catch (err) {
        console.error('Failed to start MediaRecorder:', err);
      }
    } else {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsListening(false);
    }

    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isMicEnabled, stream, meetingId, userId]);

  return { localTranscript, isListening };
};
