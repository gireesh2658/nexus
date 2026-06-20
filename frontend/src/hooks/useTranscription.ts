import { useEffect, useRef, useState } from 'react';
import { socketService } from '../services/socket';
import { useAuthStore } from '../store/authStore';

// TypeScript declarations for Web Speech API
interface ISpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: { resultIndex: number; results: { isFinal: boolean; [index: number]: { transcript: string } }[] }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: { new (): ISpeechRecognition } | undefined;
    webkitSpeechRecognition: { new (): ISpeechRecognition } | undefined;
  }
}

export const useTranscription = (meetingId: string, isMicEnabled: boolean) => {
  const user = useAuthStore(state => state.user);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const [localTranscript, setLocalTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    // Only works in supported browsers (Chrome, Edge)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: { resultIndex: number; results: { isFinal: boolean; [index: number]: { transcript: string } }[] }) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      setLocalTranscript(interimTranscript || finalTranscript);

      const socket = socketService.getSocket();
      if (socket && user) {
        if (finalTranscript.trim()) {
          socket.emit('live-transcript', {
            meetingId,
            text: finalTranscript.trim(),
            isFinal: true,
            userName: user.name
          });
          setLocalTranscript(''); // Clear interim
        } else if (interimTranscript.trim()) {
          socket.emit('live-transcript', {
            meetingId,
            text: interimTranscript.trim(),
            isFinal: false,
            userName: user.name
          });
        }
      }
    };

    recognition.onerror = (event: { error: string }) => {
      console.error('Speech recognition error', event.error);
      if (event.error === 'not-allowed') {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // Restart automatically if mic is still enabled
      if (isMicEnabled) {
        try {
          recognition.start();
        } catch {
          // Ignore
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [meetingId, user, isMicEnabled]);

  // Start or stop based on mic toggle
  useEffect(() => {
    if (isMicEnabled && !isListening && recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error('Failed to start recognition', err);
      }
    } else if (!isMicEnabled && isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, [isMicEnabled, isListening]);

  return { localTranscript, isListening };
};
