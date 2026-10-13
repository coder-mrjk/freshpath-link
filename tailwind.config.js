/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tomato: {
          50: '#FDF2F2',
          100: '#FDE8E8',
          500: '#D62828',
          600: '#C1121F',
          700: '#9B111E',
        },
        leaf: {
          50: '#F1F8F1',
          100: '#E8F5E9',
          500: '#2E7D32',
          600: '#1B5E20',
          700: '#144617',
        },
        freshAmber: {
          50: '#FFFDE7',
          500: '#F9A825',
          600: '#F57F17',
        },
        charcoal: '#1B1B1B',
        sandBg: '#FAFAF7',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
