/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1C2B45',
          50: '#F0F4F8',
          100: '#D9E2EC',
          200: '#BCCCDC',
          300: '#9FB3C8',
          400: '#829AB1',
          500: '#627D98',
          600: '#486581',
          700: '#334E68',
          800: '#243B53',
          900: '#1C2B45',
          950: '#101D30',
        },
        brass: {
          DEFAULT: '#A6763B',
          50: '#FDFBF7',
          100: '#F7F0E4',
          200: '#EBDDC5',
          300: '#DEC8A4',
          400: '#D0B181',
          500: '#A6763B',
          600: '#8A5F2C',
          700: '#6E491F',
          800: '#523414',
          900: '#38210A',
        },
      },
      fontFamily: {
        serif: ['"Source Serif 4"', '"Times New Roman"', 'Georgia', 'serif'],
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
