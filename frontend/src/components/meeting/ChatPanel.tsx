import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, Smile, MessageSquare } from 'lucide-react';
import { socketService } from '../../services/socket';
import { useAuthStore } from '../../store/authStore';
import { useMeetingStore } from '../../store/meetingStore';
import { useParams } from 'react-router-dom';

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
}

const ChatPanel: React.FC = () => {
  const { id: meetingId } = useParams<{ id: string }>();
  const user = useAuthStore(state => state.user);
  const currentMeeting = useMeetingStore(state => state.currentMeeting);
  const effectiveMeetingId = currentMeeting?.id || currentMeeting?.roomCode || meetingId;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleNewMessage = (msg: ChatMessage) => {
      setMessages(prev => {
        if (msg.senderId === user?.id) return prev;
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    socket.on('chat-message', handleNewMessage);

    return () => {
      socket.off('chat-message', handleNewMessage);
    };
  }, [user?.id]);

  useEffect(() => {
    // Auto-scroll to bottom
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !user || !effectiveMeetingId) return;

    const socket = socketService.getSocket();
    if (socket) {
      const msgId = Date.now().toString() + Math.random().toString(36).substring(2, 7);
      const newMsg = {
        id: msgId,
        meetingId: effectiveMeetingId,
        text: inputText.trim(),
        senderId: user.id,
        senderName: user.name,
      };
      
      socket.emit('send-chat', newMsg);
      
      // Optimistically add to local state
      setMessages(prev => [...prev, {
        id: msgId,
        senderId: user.id,
        senderName: user.name,
        text: inputText.trim(),
        timestamp: new Date().toISOString()
      }]);
      
      setInputText('');
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-nexus-bg">
      <div className="p-4 border-b border-nexus-border bg-nexus-surface flex items-center justify-between shrink-0">
        <h2 className="font-semibold text-label font-display flex items-center gap-2">
          Meeting Chat
          <span className="text-[10px] font-medium bg-nexus-primary/10 text-nexus-primary px-2 py-0.5 rounded-pill border border-nexus-primary/20">Live</span>
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-nexus-muted/50">
            <MessageSquare className="w-10 h-10 mb-3" />
            <p className="text-sm">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.senderId === user?.id;
            return (
              <div key={msg.id || idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <span className="text-[10px] text-nexus-muted mb-1 px-1 font-medium">{isMe ? 'You' : msg.senderName}</span>
                <div className={`px-3 py-2 rounded-xl max-w-[85%] text-sm ${isMe ? 'bg-nexus-surfaceElevated text-nexus-text rounded-tr-sm border border-[rgba(255,255,255,0.06)]' : 'bg-nexus-chatIncoming text-nexus-text rounded-tl-sm'}`}>
                  {msg.text}
                </div>
                <span className="text-[9px] text-nexus-muted/70 mt-1 px-1 font-mono">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-nexus-surface border-t border-nexus-border shrink-0">
        <form onSubmit={handleSend} className="relative flex items-center">
          <div className="absolute left-3 flex items-center gap-2 text-nexus-muted">
            <button type="button" className="hover:text-nexus-text transition-colors"><Smile className="w-4 h-4" /></button>
            <button type="button" className="hover:text-nexus-text transition-colors"><Paperclip className="w-4 h-4" /></button>
          </div>
          <input 
            type="text" 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..." 
            className="w-full bg-nexus-bg border border-nexus-border rounded-card py-2.5 pl-14 pr-12 text-sm text-nexus-text focus:outline-none focus:border-nexus-primary/50 focus:ring-1 focus:ring-nexus-primary/50 transition-all placeholder:text-nexus-muted"
          />
          <button 
            type="submit"
            disabled={!inputText.trim()}
            className="absolute right-2 p-1.5 btn-signal rounded-lg text-white disabled:opacity-50 disabled:bg-nexus-border disabled:text-nexus-muted transition-colors border-none"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatPanel;
