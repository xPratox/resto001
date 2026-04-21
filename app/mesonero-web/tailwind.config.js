/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'resto-bg': 'rgb(var(--resto-bg-rgb) / <alpha-value>)',
        'resto-surface': 'rgb(var(--resto-surface-rgb) / <alpha-value>)',
        'resto-text': 'rgb(var(--resto-text-rgb) / <alpha-value>)',
        'resto-accent': 'rgb(var(--resto-accent-rgb) / <alpha-value>)',
        'resto-cyan': 'rgb(var(--resto-cyan-rgb) / <alpha-value>)',
        deepCarbon: 'rgb(var(--resto-bg-rgb) / <alpha-value>)',
        slateAccent: 'rgb(var(--resto-surface-rgb) / <alpha-value>)',
        metallicLight: 'rgb(var(--resto-text-rgb) / <alpha-value>)',
        metallicMuted: 'rgb(var(--resto-muted-rgb) / <alpha-value>)',
        metallicSoft: 'rgb(var(--resto-soft-rgb) / <alpha-value>)',
        electricViolet: 'rgb(var(--resto-accent-rgb) / <alpha-value>)',
        actionCyan: 'rgb(var(--resto-cyan-rgb) / <alpha-value>)',
        info: 'rgb(var(--resto-border-rgb) / <alpha-value>)',
        neutral: 'rgb(var(--resto-border-rgb) / <alpha-value>)',
        success: 'rgb(var(--resto-success-rgb) / <alpha-value>)',
        warning: 'rgb(var(--resto-warning-rgb) / <alpha-value>)',
        error: 'rgb(var(--resto-error-rgb) / <alpha-value>)',
        carbon: 'rgb(var(--resto-bg-rgb) / <alpha-value>)',
        carbonCard: 'rgb(var(--resto-card-rgb) / <alpha-value>)',
        carbonLine: 'rgb(var(--resto-border-rgb) / <alpha-value>)',
        sunsetOrange: 'rgb(var(--resto-accent-rgb) / <alpha-value>)',
        sunset: 'rgb(var(--resto-accent-rgb) / <alpha-value>)',
        snowText: 'rgb(var(--resto-text-rgb) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Space Grotesk', 'sans-serif'],
        display: ['Cormorant Garamond', 'serif'],
      },
      boxShadow: {
        glow: '0 18px 36px rgba(212, 175, 55, 0.16)',
        cyan: '0 18px 36px rgba(192, 192, 192, 0.18)',
        contact: '0 14px 28px rgba(10, 10, 10, 0.12)',
      },
      backgroundImage: {
        'mesh-carbon':
          'radial-gradient(circle at top left, rgba(212, 175, 55, 0.14), transparent 24%), radial-gradient(circle at bottom right, rgba(192, 192, 192, 0.12), transparent 22%), linear-gradient(180deg, #0A0A0A 0%, #111111 100%)',
      },
    },
  },
  plugins: [],
}

