import { create } from 'zustand';
import axios from 'axios';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null; // Note: We only keep this in memory now for api.ts, not localStorage
  isAuthenticated: boolean;
  isInitialized: boolean;
  login: (user: User, token: string) => void;
  setToken: (token: string) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  setInitialized: (val: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  (set) => ({
    user: null,
    token: null,
    isAuthenticated: false,
    isInitialized: false,

    login: (user, token) => set({ user, token, isAuthenticated: true }),

    setToken: (token) => set({ token }),

    logout: async () => {
      try {
        await axios.post(
          (import.meta.env.VITE_SIGNAL_URL || '') + '/api/auth/logout',
          {},
          { withCredentials: true }
        );
      } catch {
        // Ignore
      }
      set({ user: null, token: null, isAuthenticated: false });
    },

    updateUser: (updatedFields) =>
      set((state) => ({
        user: state.user ? { ...state.user, ...updatedFields } : null,
      })),

    setInitialized: (val) => set({ isInitialized: val })
  })
);
