/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef4fb',
          100: '#dbe9f8',
          200: '#bfd8f1',
          300: '#94bfe5',
          400: '#5f98d4',
          500: '#2f73ba',
          600: '#1f5c97',
          700: '#194a7a',
          800: '#173f66',
          900: '#152f4c',
          950: '#0d1b2f',
        },
        surface: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
        },
        // Deep Space palette
        ds: {
          bg0: '#070A12',
          bg1: '#0B1020',
          surface0: 'rgba(17, 24, 39, 0.88)',
          surface1: 'rgba(15, 23, 42, 0.92)',
          text0: '#F8FAFC',
          text1: '#94A3B8',
          text2: '#64748B',
          stroke: 'rgba(148, 163, 184, 0.18)',
          accent: {
            300: '#A5B4FC',
            400: '#818CF8',
            500: '#6366F1',
            600: '#4F46E5',
            700: '#4338CA',
          },
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Manrope', 'IBM Plex Sans', 'sans-serif'],
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glow': '0 0 12px rgba(129, 140, 248, 0.25)',
        'glow-lg': '0 0 24px rgba(129, 140, 248, 0.35)',
      },
    },
  },
  plugins: [],
}







