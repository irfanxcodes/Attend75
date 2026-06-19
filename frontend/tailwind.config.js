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
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        hourglass: 'hourglass 1.5s ease-in-out infinite',
        fadeIn: 'fadeIn 0.25s ease-out both',
      },
    },
  },
  plugins: [],
}

