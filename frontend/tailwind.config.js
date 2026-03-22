/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          500: '#0ea5e9',
          700: '#0369a1',
        },
      },
      keyframes: {
        hourglass: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '50%': { transform: 'rotate(180deg)' },
        },
      },
      animation: {
        hourglass: 'hourglass 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

