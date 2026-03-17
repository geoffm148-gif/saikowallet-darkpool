/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0A0A0A',
        surface: '#1A1A1A',
        border: '#333333',
        muted: '#888888',
        red: '#E31B23',
        white: '#FFFFFF',
      },
      fontFamily: {
        anton: ['Anton', 'Impact', 'Arial Black', 'sans-serif'],
        body: ['Arial', 'Helvetica', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '2px',
        sm: '1px',
        md: '2px',
        lg: '2px',
        xl: '2px',
        '2xl': '2px',
        full: '2px',
      },
    },
  },
  plugins: [],
};
