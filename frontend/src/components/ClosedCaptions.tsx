import React, { useState, useEffect, useCallback } from 'react';
import { useDataChannel } from '@livekit/components-react';
import type { ReceivedDataMessage } from '@livekit/components-core';

interface Caption {
  id: string;
  participant_id: string;
  text: string;
  timestamp: number;
}

export const ClosedCaptions: React.FC = () => {
  const [captions, setCaptions] = useState<Caption[]>([]);

  // Catch the Data Channel broadcasts pushed by livekit_egress.py
  const onDataReceived = useCallback((msg: ReceivedDataMessage<"captions">) => {
    if (!msg.topic || msg.topic === 'captions') {
      try {
        const textStr = typeof msg.payload === 'string'
          ? msg.payload
          : new TextDecoder().decode(msg.payload);
        const data = JSON.parse(textStr) as {
          participant_id: string;
          text: string;
          timestamp: number;
        };

        if (!data || !data.text) return;

        setCaptions((prev) => {
          const newCaption: Caption = {
            id: `${data.participant_id || 'speaker'}-${data.timestamp || Date.now()}`,
            participant_id: data.participant_id || 'Speaker',
            text: data.text,
            timestamp: data.timestamp || Date.now()
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

  // Auto-clear captions if no one has spoken for 15 seconds
  useEffect(() => {
    if (captions.length === 0) return;

    const timer = setTimeout(() => {
      setCaptions([]);
    }, 15000);

    return () => clearTimeout(timer);
  }, [captions]);

  if (captions.length === 0) return null;

  return (
    <div
      data-testid="closed-captions-container"
      style={{
        position: 'fixed',
        bottom: '90px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        pointerEvents: 'none',
        maxWidth: '720px',
        width: '90%',
      }}
    >
      {captions.map((cap) => (
        <div
          key={cap.id}
          data-testid="caption-item"
          style={{
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '8px 16px',
            color: 'white',
            fontSize: '15px',
            lineHeight: '1.4',
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
            animation: 'fadeInUp 0.3s ease-out',
          }}
        >
          <span style={{
            color: '#38bdf8',
            fontWeight: 600,
            marginRight: '8px',
          }}>
            {cap.participant_id}:
          </span>
          <span style={{ color: '#f1f5f9' }}>{cap.text}</span>
        </div>
      ))}
    </div>
  );
};
