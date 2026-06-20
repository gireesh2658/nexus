import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, Smile, MessageSquare } from 'lucide-react';
import { socketService } from '../../services/socket';
import { useAuthStore } from '../../store/authStore';
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleNewMessage = (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    };

    socket.on('chat-message', handleNewMessage);

    return () => {
      socket.off('chat-message', handleNewMessage);
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !user || !meetingId) return;

    const socket = socketService.getSocket();
    if (socket) {
      const newMsg = {
        meetingId,
        text: inputText.trim(),
        senderId: user._id,
        senderName: user.name,
      };
      
      socket.emit('send-chat', newMsg);
      
      // Optimistically add to local state
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        senderId: user._id,
        senderName: user.name,
        text: inputText.trim(),
        timestamp: new Date().toISOString()
      }]);
      
      setInputText('');
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-nexus-bg/50 backdrop-blur-xl border-l border-white/5">
      <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
        <h2 className="font-bold text-lg flex items-center gap-2">
          Meeting Chat
          <span className="text-xs font-normal bg-nexus-primary/20 text-nexus-primary px-2 py-0.5 rounded-full border border-nexus-primary/30">Live</span>
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-nexus-muted opacity-50">
            <MessageSquare className="w-12 h-12 mb-2" />
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.senderId === user?._id;
            return (
              <div key={msg.id || idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <span className="text-xs text-nexus-muted mb-1 px-1">{isMe ? 'You' : msg.senderName}</span>
                <div className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm ${isMe ? 'bg-nexus-primary text-white rounded-tr-sm' : 'bg-white/10 text-white rounded-tl-sm border border-white/5'}`}>
                  {msg.text}
                </div>
                <span className="text-[10px] text-nexus-muted mt-1 px-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-black/20 border-t border-white/5">
        <form onSubmit={handleSend} className="relative flex items-center">
          <div className="absolute left-3 flex items-center gap-2 text-nexus-muted">
            <button type="button" className="hover:text-white transition-colors"><Smile className="w-5 h-5" /></button>
            <button type="button" className="hover:text-white transition-colors"><Paperclip className="w-4 h-4" /></button>
          </div>
          <input 
            type="text" 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..." 
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-16 pr-12 text-sm focus:outline-none focus:border-nexus-primary/50 focus:ring-1 focus:ring-nexus-primary/50 transition-all placeholder:text-nexus-muted"
          />
          <button 
            type="submit"
            disabled={!inputText.trim()}
            className="absolute right-2 p-1.5 bg-nexus-primary rounded-lg text-white disabled:opacity-50 disabled:bg-white/10 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};


export default ChatPanel;
