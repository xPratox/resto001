/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        deepCarbon: '#0F172A',
        slateAccent: '#1E293B',
        metallicLight: '#F8FAFC',
        metallicMuted: '#CBD5E1',
        metallicSoft: '#94A3B8',
        sunsetOrange: '#FF6B35',
        success: '#10B981',
        error: '#EF4444',
        carbon: '#0F172A',
        carbonCard: '#1E293B',
        carbonLine: '#334155',
        sunset: '#FF6B35',
        snowText: '#F8FAFC',
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        display: ['Sora', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 20px 45px rgba(255, 107, 53, 0.22)',
      },
      backgroundImage: {
        'mesh-carbon':
          'radial-gradient(circle at top left, rgba(255, 107, 53, 0.18), transparent 24%), radial-gradient(circle at bottom right, rgba(255, 107, 53, 0.12), transparent 22%), linear-gradient(180deg, #0f172a 0%, #111827 100%)',
      },
    },
  },
  plugins: [],
}

