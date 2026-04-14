/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'resto-bg': '#111827',
        'resto-surface': '#374151',
        'resto-text': '#FFFFFF',
        'resto-accent': '#00D8FF',
        'resto-cyan': '#06B6D4',
        deepCarbon: '#111827',
        slateAccent: '#374151',
        metallicLight: '#FFFFFF',
        metallicMuted: '#CBD5E1',
        metallicSoft: '#94A3B8',
        electricViolet: '#00D8FF',
        actionCyan: '#06B6D4',
        info: '#475569',
        neutral: '#475569',
        success: '#10B981',
        warning: '#F97316',
        error: '#EF4444',
        carbon: '#111827',
        carbonCard: '#374151',
        carbonLine: '#475569',
        sunsetOrange: '#00D8FF',
        sunset: '#00D8FF',
        snowText: '#FFFFFF',
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        display: ['Sora', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 18px 36px rgba(0, 216, 255, 0.18)',
        cyan: '0 18px 36px rgba(6, 182, 212, 0.18)',
      },
      backgroundImage: {
        'mesh-carbon':
          'radial-gradient(circle at top left, rgba(0, 216, 255, 0.18), transparent 24%), radial-gradient(circle at bottom right, rgba(6, 182, 212, 0.12), transparent 22%), linear-gradient(180deg, #111827 0%, #0b1220 100%)',
      },
    },
  },
  plugins: [],
}

