import React, { useEffect, useRef, useState } from 'react';
import { socketService } from '../../services/socket';
import { FileText, Radio } from 'lucide-react';

interface TranscriptLine {
  id: string;
  userId: string;
  userName: string;
  text: string;
  isFinal: boolean;
  timestamp: string;
}

const TranscriptPanel: React.FC = () => {
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleTranscript = (data: TranscriptLine) => {
      setLines(prev => {
        // If it's interim, try to update the existing interim line for that user
        if (!data.isFinal) {
          const newLines = [...prev];
          const lastIndex = newLines.findLastIndex(l => l.userId === data.userId && !l.isFinal);
          if (lastIndex >= 0) {
            newLines[lastIndex] = { ...data, id: Date.now().toString() };
            return newLines;
          }
        } else {
          // If final, remove the interim line and push the final one
          const newLines = prev.filter(l => !(l.userId === data.userId && !l.isFinal));
          return [...newLines, { ...data, id: Date.now().toString() }];
        }
        return [...prev, { ...data, id: Date.now().toString() }];
      });
    };

    socket.on('live-transcript', handleTranscript);

    return () => {
      socket.off('live-transcript', handleTranscript);
    };
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className="w-full h-full flex flex-col bg-nexus-bg/50 backdrop-blur-xl border-l border-white/5">
      <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Live Transcript
        </h2>
        <div className="flex items-center gap-1 text-xs text-nexus-primary bg-nexus-primary/10 px-2 py-1 rounded border border-nexus-primary/20">
          <Radio className="w-3 h-3 animate-pulse" />
          Capturing
        </div>
      </div>

      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10"
      >
        {lines.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-nexus-muted opacity-50 text-sm text-center">
            <p>Captions will appear here when someone speaks.</p>
          </div>
        ) : (
          lines.map((line, i) => {
            const showName = i === 0 || lines[i - 1].userId !== line.userId || lines[i - 1].isFinal !== line.isFinal;
            return (
              <div key={line.id} className={`flex flex-col ${line.isFinal ? 'opacity-100' : 'opacity-60 italic'}`}>
                {showName && (
                  <span className="text-xs text-nexus-primary/80 mb-1 font-semibold flex items-center gap-2">
                    {line.userName}
                    <span className="text-[10px] text-nexus-muted font-normal">
                      {new Date(line.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </span>
                )}
                <p className="text-sm text-white/90 leading-relaxed bg-white/5 px-3 py-2 rounded-lg border border-white/5">
                  {line.text}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TranscriptPanel;
