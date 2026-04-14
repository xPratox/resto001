/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'resto-bg': '#111827',
        'resto-surface': '#1E293B',
        'resto-panel': '#0F172A',
        'resto-text': '#FFFFFF',
        'resto-accent': '#00D8FF',
        'resto-cyan': '#06B6D4',
        carbonLine: '#334155',
        metallicMuted: '#CBD5E1',
        metallicSoft: '#94A3B8',
        success: '#10B981',
        warning: '#F97316',
        error: '#EF4444',
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        display: ['Sora', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 18px 36px rgba(0, 216, 255, 0.18)',
        cyan: '0 18px 36px rgba(6, 182, 212, 0.2)',
      },
      backgroundImage: {
        'mesh-carbon':
          'radial-gradient(circle at top left, rgba(0, 216, 255, 0.18), transparent 24%), radial-gradient(circle at bottom right, rgba(6, 182, 212, 0.12), transparent 22%), linear-gradient(180deg, #111827 0%, #0b1220 100%)',
      },
    },
  },
  plugins: [],
}