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

// Single-flight refresh promise for concurrent 401s
let refreshPromise: Promise<string | null> | null = null;

// Response interceptor: auto-refresh on 401 with single-flight logic
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    // If skip flag is set or already retried, do not attempt refresh
    if (!original || original._skipAuthRefresh) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      if (!refreshPromise) {
        refreshPromise = (async () => {
          try {
            const { data } = await axios.post(
              (import.meta.env.VITE_SIGNAL_URL || '') + '/api/auth/refresh',
              {},
              { withCredentials: true },
            );
            if (data.token) {
              useAuthStore.getState().setToken(data.token);
              return data.token as string;
            }
            return null;
          } catch {
            return null;
          } finally {
            refreshPromise = null;
          }
        })();
      }

      const newToken = await refreshPromise;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
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
