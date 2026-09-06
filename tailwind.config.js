/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f6f7f4',
          100: '#e8ebe3',
          200: '#d1d7c8',
          700: '#3d4635',
          800: '#2a3124',
          900: '#1a1f16',
        },
        accent: {
          DEFAULT: '#2f6f4e',
          soft: '#e6f2eb',
          dark: '#24573d',
        },
      },
      fontFamily: {
        // Segoe UI hỗ trợ tiếng Việt; tránh Georgia/Palatino (thiếu dấu → vỡ chữ như "rô`i")
        sans: ['"Segoe UI"', 'Candara', 'Calibri', 'system-ui', 'sans-serif'],
        display: ['"Segoe UI"', 'Candara', 'Calibri', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
