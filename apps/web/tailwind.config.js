/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#2563EB', 50: '#EFF6FF', 100: '#DBEAFE', 500: '#3B82F6', 600: '#2563EB', 700: '#1D4ED8', 900: '#1E3A8A' },
        secondary: { DEFAULT: '#0F172A', 800: '#1E293B', 900: '#0F172A' },
        accent: { DEFAULT: '#7C3AED', 500: '#8B5CF6', 600: '#7C3AED' },
        success: { DEFAULT: '#16A34A', 50: '#F0FDF4', 500: '#22C55E', 600: '#16A34A' },
        warning: { DEFAULT: '#D97706', 50: '#FFFBEB', 500: '#F59E0B', 600: '#D97706' },
        danger: { DEFAULT: '#DC2626', 50: '#FEF2F2', 500: '#EF4444', 600: '#DC2626' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [],
};
