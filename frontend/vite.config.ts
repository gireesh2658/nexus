import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  envDir: '../',
  plugins: [
    react(),
    nodePolyfills(),
  ],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api/focus': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: true,
      },
      '/api/audio': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: true,
      },
      '/api/analytics': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        ws: true,
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('socket.io-client') || id.includes('mediasoup-client')) {
              return 'webrtc';
            }
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom') || id.includes('zustand')) {
              return 'vendor';
            }
            return 'modules';
          }
        }
      }
    }
  },
  define: {
    global: 'window',
  },
  optimizeDeps: {
    exclude: ['@mediapipe/face_mesh', '@mediapipe/camera_utils']
  }
})
