/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Brand primary accent - Gray Orange
        gold: {
          DEFAULT: '#bd9348',
          light: '#dec181',
        },
        // Brand backgrounds
        cream: '#f6f4e5',
        // Brand text
        charcoal: '#313130',
        // Legacy aliases for easy migration
        honey: {
          50: '#f6f4e5',
          100: '#dec181',
          200: '#dec181',
          300: '#dec181',
          400: '#bd9348',
          500: '#bd9348',
          600: '#bd9348',
          700: '#9a7a3b',
          800: '#7a612f',
          900: '#5a4722',
        },
        hive: {
          dark: '#313130',
          light: '#f6f4e5',
        },
      },
      fontFamily: {
        display: ['Libre Baskerville', 'serif'],
        body: ['Lato', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
