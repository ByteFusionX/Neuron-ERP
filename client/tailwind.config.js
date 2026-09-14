/** @type {import('tailwindcss').Config} */
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
        // Premium ERP surface palette — violet/orange accents on a warm
        // off-white (light) / violet-tinted charcoal (dark), rather than
        // flat white/gray-900. Used on the sidebar and navbar shell.
        erp: {
          bg: '#FAFAFA',
          surface: '#FFFFFF',
          'surface-dark': '#15131F',
          'surface-dark-alt': '#1C1930',
          border: '#F3F4F6',
          'border-dark': '#2A2640',
        },
      },
    },
  },
  plugins: [],
}


