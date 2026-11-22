import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

const SIGNAL_URL = import.meta.env.VITE_SIGNAL_URL || 'http://localhost:4000';

class SocketService {
  private socket: Socket | null = null;

  connect(): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    if (this.socket) {
      this.socket.connect();
      return this.socket;
    }

    this.socket = io(SIGNAL_URL, {
      auth: (cb: (data: { token?: string | null }) => void) => {
        cb({ token: useAuthStore.getState().token });
      },
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    this.socket.on('connect', () => {
      // Connection established
    });

    this.socket.on('disconnect', () => {
      // Disconnected
    });

    this.socket.on('auth-error', (data: { error: string }) => {
      console.error('[SocketService] Auth error:', data.error);
    });

    return this.socket;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();

// Subscribe to the auth store inside socket.ts:
// Disconnect on logout or user change, recreate on login
let currentUserId: string | null = useAuthStore.getState().user?.id || null;

useAuthStore.subscribe((state) => {
  const newUserId = state.user?.id || null;

  if (newUserId !== currentUserId) {
    if (!newUserId) {
      // User logged out
      socketService.disconnect();
    } else if (currentUserId && newUserId !== currentUserId) {
      // User switched account
      socketService.disconnect();
      socketService.connect();
    } else if (!currentUserId && newUserId) {
      // Logged in
      socketService.connect();
    }
    currentUserId = newUserId;
  }
});
