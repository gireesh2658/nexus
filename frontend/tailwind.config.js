/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        nexus: {
          bg: '#0A0B0F',
          surface: 'rgba(20, 20, 30, 0.4)',
          surfaceHover: 'rgba(30, 30, 45, 0.6)',
          border: 'rgba(255,255,255,0.05)',
          borderHighlight: 'rgba(255,255,255,0.15)',
          text: '#F4F4F9',
          muted: '#8B8D98',
          success: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
          primary: '#7C3AED',
          cyan: '#00D2FF',
        }
      },
      backgroundImage: {
        'nexus-primary': 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)',
        'nexus-accent': 'linear-gradient(135deg, #00D2FF 0%, #3A7BD5 100%)',
        'nexus-success-gradient': 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
        'nexus-danger-gradient': 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glass-hover': '0 8px 32px 0 rgba(0, 0, 0, 0.6)',
        'glow-primary': '0 0 20px rgba(108, 92, 231, 0.4)',
        'glow-accent': '0 0 20px rgba(0, 210, 255, 0.4)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'spin-slow': 'spin 8s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: 1, filter: 'brightness(1)' },
          '50%': { opacity: .7, filter: 'brightness(1.5)' },
        }
      }
    },
  },
  plugins: [],
}
