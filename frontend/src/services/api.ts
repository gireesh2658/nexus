import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: (import.meta.env.VITE_SIGNAL_URL || '') + '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach JWT token from store
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    // If we get a 401 and haven't retried yet, try refreshing the token
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      try {
        const { data } = await axios.post(
          (import.meta.env.VITE_SIGNAL_URL || '') + '/api/auth/refresh',
          {},
          { withCredentials: true },
        );
        if (data.token) {
          useAuthStore.getState().setToken(data.token);
          original.headers.Authorization = `Bearer ${data.token}`;
          return api(original);
        }
      } catch {
        // Refresh failed — force logout
      }

      useAuthStore.getState().logout();
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/' && path !== '/register') {
        toast.error('Session expired. Please log in again.');
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  },
);

export default api;
