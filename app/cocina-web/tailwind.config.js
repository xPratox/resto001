/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'resto-bg': '#0A0A0A',
        'resto-surface': '#181818',
        'resto-panel': '#141414',
        'resto-text': '#F5F5F5',
        'resto-accent': '#D4AF37',
        'resto-cyan': '#C0C0C0',
        carbonLine: '#8E8E8E',
        metallicMuted: '#D6D6D6',
        metallicSoft: '#A0A0A0',
        success: '#D4AF37',
        warning: '#C0C0C0',
        error: '#C76B6B',
      },
      fontFamily: {
        sans: ['Space Grotesk', 'sans-serif'],
        display: ['Cormorant Garamond', 'serif'],
      },
      boxShadow: {
        glow: '0 18px 36px rgba(212, 175, 55, 0.18)',
        cyan: '0 18px 36px rgba(192, 192, 192, 0.2)',
        contact: '0 16px 28px rgba(10, 10, 10, 0.12)',
      },
      backgroundImage: {
        'mesh-carbon':
          'radial-gradient(circle at top left, rgba(212, 175, 55, 0.14), transparent 24%), radial-gradient(circle at bottom right, rgba(192, 192, 192, 0.12), transparent 22%), linear-gradient(180deg, #0A0A0A 0%, #111111 100%)',
      },
    },
  },
  plugins: [],
}