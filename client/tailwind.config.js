/** @type {import('tailwindcss').Config} */
const grayVar = (step) => `rgb(var(--erp-gray-${step}) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      screens: {
        '3xl': '1600px',
        '4xl': '1920px',
        '5xl': '2560px',
      },
      colors: {
        // gray resolves through CSS vars: Tailwind defaults in light, neutral (hue-free) scale in dark — see styles.css
        gray: {
          50: grayVar(50),
          100: grayVar(100),
          200: grayVar(200),
          300: grayVar(300),
          400: grayVar(400),
          500: grayVar(500),
          600: grayVar(600),
          700: grayVar(700),
          800: grayVar(800),
          900: grayVar(900),
          950: grayVar(950),
        },
        erp: {
          bg: '#FAFAFA',
          surface: '#FFFFFF',
          'surface-dark': '#111111',
          'surface-dark-alt': '#1A1A1A',
          border: '#F3F4F6',
          'border-dark': '#262626',
        },
      },
    },
  },
  plugins: [],
}
