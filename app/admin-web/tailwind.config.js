/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        porcelain: '#F6F1E8',
        porcelainSoft: '#FFFDFC',
        obsidian: '#0A0A0A',
        charcoal: '#1A1A1A',
        smoke: '#F5F5F5',
        gold: {
          DEFAULT: '#D4AF37',
          deep: '#BF953F',
          light: '#FCF6BA',
          rich: '#B38728',
        },
        silver: {
          DEFAULT: '#C0C0C0',
          soft: '#D6D6D6',
          deep: '#8E8E8E',
        },
      },
      fontFamily: {
        sans: ['Space Grotesk', 'sans-serif'],
        display: ['Cormorant Garamond', 'serif'],
      },
      boxShadow: {
        contact: '0 14px 28px rgba(10, 10, 10, 0.12)',
        metallic: '0 0 18px rgba(212, 175, 55, 0.16)',
      },
      backgroundImage: {
        'gold-polish': 'linear-gradient(135deg, #BF953F 0%, #FCF6BA 50%, #B38728 100%)',
        'silver-satin': 'linear-gradient(135deg, rgba(142, 142, 142, 0.62) 0%, rgba(245, 245, 245, 0.9) 50%, rgba(160, 160, 160, 0.62) 100%)',
      },
    },
  },
}
