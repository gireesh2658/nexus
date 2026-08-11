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
          bg: '#0A0B0E',           // Void
          surface: '#16181D',       // Surface (solid)
          surfaceHover: '#1E2027',  // Surface hover (solid)
          surfaceElevated: '#2A2F3A', // Elevated surface (chat outgoing)
          chatIncoming: '#1F2128', // Chat incoming bubbles
          border: 'rgba(255,255,255,0.04)',
          borderHighlight: 'rgba(255,255,255,0.08)',
          borderHover: 'rgba(146,151,166,0.4)', // Ink-muted at 40%
          text: '#F3F4F6',         // Paper
          muted: '#9297A6',        // Ink-muted
          success: '#10B981',
          warning: '#F5B843',      // Static
          danger: '#FF5C5C',       // Alert
          primary: '#5B57FF',      // Signal indigo
          cyan: '#00D4FF',         // Signal cyan
        }
      },
      backgroundImage: {
        'nexus-signal': 'linear-gradient(135deg, #5B57FF 0%, #00D4FF 100%)',
        'nexus-signal-subtle': 'linear-gradient(135deg, rgba(91,87,255,0.15) 0%, rgba(0,212,255,0.15) 100%)',
        'nexus-danger-gradient': 'linear-gradient(135deg, #FF5C5C 0%, #FF3B3B 100%)',
      },
      boxShadow: {
        'matte': '0 1px 2px rgba(0, 0, 0, 0.3)',
        'matte-lg': '0 2px 8px rgba(0, 0, 0, 0.4)',
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'body': ['15px', { lineHeight: '1.6', fontWeight: '400' }],
        'label': ['15px', { lineHeight: '1.4', fontWeight: '500' }],
        'label-sm': ['13px', { lineHeight: '1.4', fontWeight: '500', letterSpacing: '0.01em' }],
      },
      borderRadius: {
        'card': '12px',
        'panel': '16px',
        'pill': '9999px',
      },
      spacing: {
        'grid-xs': '4px',
        'grid-sm': '8px',
        'grid-md': '12px',
        'grid-base': '16px',
        'grid-lg': '24px',
        'grid-xl': '32px',
        'grid-2xl': '48px',
        'grid-3xl': '64px',
      },
      animation: {
        'ring-breathe': 'ringBreathe 3s ease-in-out infinite',
        'spin-slow': 'spin 8s linear infinite',
        'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        ringBreathe: {
          '0%, 100%': { opacity: '1', filter: 'brightness(1)' },
          '50%': { opacity: '0.7', filter: 'brightness(1.3)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        }
      }
    },
  },
  plugins: [],
}
