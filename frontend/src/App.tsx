import { useEffect } from 'react';
import AppRoutes from './routes';
import { useAuthStore } from './store/authStore';
import { authService } from './services/authService';
import axios from 'axios';

function App() {
  const { isInitialized, setInitialized, login, logout, setToken } = useAuthStore();

  useEffect(() => {
    const initAuth = async () => {
      try {
        // Attempt to refresh the session silently using httpOnly cookie
        const { data } = await axios.post(
          (import.meta.env.VITE_SIGNAL_URL || '') + '/api/auth/refresh',
          {},
          { withCredentials: true }
        );
        
        if (data.token) {
          setToken(data.token);
          const meData = await authService.getMe();
          login(meData.user, data.token);
        }
      } catch {
        // Backend unreachable or no valid session — just clear state locally
        // Don't call logout() here as it also hits the API and would fail
        useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
      } finally {
        setInitialized(true);
      }
    };

    if (!isInitialized) {
      initAuth();
    }
  }, [isInitialized, login, logout, setInitialized, setToken]);

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-nexus-bg flex flex-col items-center justify-center relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-nexus-primary/20 blur-[50px] rounded-full animate-pulse" />
        <div className="w-12 h-12 border-4 border-nexus-primary/30 border-t-nexus-primary rounded-full animate-spin mb-4 relative z-10" />
        <p className="text-nexus-muted font-medium tracking-wide relative z-10">Initializing Secure Session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-nexus-bg text-nexus-text font-sans">

      <AppRoutes />
    </div>
  );
}

export default App;
