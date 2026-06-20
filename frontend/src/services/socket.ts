import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

const SIGNAL_URL = import.meta.env.VITE_SIGNAL_URL || 'http://localhost:4000';

class SocketService {
  private socket: Socket | null = null;

  connect(): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    const token = useAuthStore.getState().token;
    
    this.socket = io(SIGNAL_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      // Intentionally left blank or handle logic
    });

    this.socket.on('disconnect', () => {
      // Intentionally left blank
    });

    this.socket.on('auth-error', (data) => {
      console.error('[SocketService] Auth error:', data.error);
    });

    return this.socket;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
