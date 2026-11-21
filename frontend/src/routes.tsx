import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

import { AppLayout } from './components/layout/AppLayout';

const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Meetings = lazy(() => import('./pages/Meetings'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));
const MeetingLobby = lazy(() => import('./pages/MeetingLobby'));
const MeetingRoom = lazy(() => import('./pages/MeetingRoom'));
const MeetingSummary = lazy(() => import('./pages/MeetingSummary'));

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const AppRoutes = () => {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-nexus-bg flex flex-col items-center justify-center relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-nexus-primary/20 blur-[50px] rounded-full animate-pulse" />
        <div className="w-12 h-12 border-4 border-nexus-primary/30 border-t-nexus-primary rounded-full animate-spin mb-4 relative z-10" />
      </div>
    }>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <AppLayout>
                <Dashboard />
              </AppLayout>
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/meetings" 
          element={
            <ProtectedRoute>
              <AppLayout>
                <Meetings />
              </AppLayout>
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/analytics" 
          element={
            <ProtectedRoute>
              <AppLayout>
                <Analytics />
              </AppLayout>
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/settings" 
          element={
            <ProtectedRoute>
              <AppLayout>
                <Settings />
              </AppLayout>
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/lobby/:roomId" 
          element={
            <ProtectedRoute>
              <MeetingLobby />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/room/:id" 
          element={
            <ProtectedRoute>
              <MeetingRoom />
            </ProtectedRoute>
          } 
        />
        
        <Route
          path="/meeting/:id/summary"
          element={
            <ProtectedRoute>
              <MeetingSummary />
            </ProtectedRoute>
          }
        />
        <Route
          path="/meetings/:id/summary"
          element={
            <ProtectedRoute>
              <MeetingSummary />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
