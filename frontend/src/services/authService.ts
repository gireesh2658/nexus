import api from './api';
import type { AuthResponse } from '../types';

export const authService = {
  login: async (credentials: Record<string, string>): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>('/auth/login', credentials);
    return data;
  },

  register: async (userData: Record<string, string>): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>('/auth/register', userData);
    return data;
  },

  getMe: async (): Promise<{ user: AuthResponse['user'] }> => {
    const { data } = await api.get<{ user: AuthResponse['user'] }>('/auth/me');
    return data;
  }
};
