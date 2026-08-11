import React, { useState, useEffect, useCallback } from 'react';
import { useDataChannel } from '@livekit/components-react';

interface Caption {
  id: string;
  participant_id: string;
  text: string;
  timestamp: number;
}

export const ClosedCaptions: React.FC = () => {
  const [captions, setCaptions] = useState<Caption[]>([]);

  // Catch the Data Channel broadcasts pushed by cc_broadcaster.py
  const onDataReceived = useCallback((msg: Uint8Array, participant?: unknown, topic?: string) => {
    if (topic === 'captions') {
      try {
        const decoder = new TextDecoder();
        const data = JSON.parse(decoder.decode(msg)) as {
          participant_id: string;
          text: string;
          timestamp: number;
        };

        setCaptions((prev) => {
          const newCaption: Caption = {
            id: `${data.participant_id}-${data.timestamp}`,
            participant_id: data.participant_id,
            text: data.text,
            timestamp: data.timestamp
          };
          
          // Maintain a rolling state of the last 3 spoken sentences
          const updated = [...prev, newCaption];
          return updated.slice(Math.max(updated.length - 3, 0));
        });
      } catch (e) {
        console.error("Failed to parse incoming caption data", e);
      }
    }
  }, []);

  // Hook into the LiveKit React SDK
  useDataChannel('captions', onDataReceived);

  // Auto-clear captions if no one has spoken for 6 seconds
  useEffect(() => {
    if (captions.length === 0) return;

    const timer = setTimeout(() => {
      setCaptions([]);
    }, 6000);

    return () => clearTimeout(timer);
  }, [captions]);

  if (captions.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '80px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
      pointerEvents: 'none',
      maxWidth: '720px',
      width: '90%',
    }}>
      {captions.map((cap) => (
        <div
          key={cap.id}
          style={{
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: '8px',
            padding: '8px 16px',
            color: 'white',
            fontSize: '15px',
            lineHeight: '1.4',
            textAlign: 'center',
            animation: 'fadeInUp 0.3s ease-out',
          }}
        >
          <span style={{
            color: '#60a5fa',
            fontWeight: 600,
            marginRight: '6px',
          }}>
            {cap.participant_id}:
          </span>
          <span>{cap.text}</span>
        </div>
      ))}
    </div>
  );
};
