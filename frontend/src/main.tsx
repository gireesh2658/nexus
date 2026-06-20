import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <Toaster 
        position="top-right" 
        toastOptions={{
          style: {
            background: 'rgba(20, 20, 25, 0.8)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#E8E8F0',
          }
        }} 
      />
    </BrowserRouter>
  </StrictMode>,
);
