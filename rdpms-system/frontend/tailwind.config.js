/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./index.html",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#0A84FF',  // --primary
          600: '#0070e0',  // --primary-hover
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        danger: {
          500: '#FF453A',  // --danger
        },
        success: {
          500: '#30D158',  // --success
        },
        warning: {
          500: '#FFD60A',  // --warning
        },
      },
    },
  },
  plugins: [],
}