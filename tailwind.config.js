/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep Slate Dark Canvas & Surfaces
        canvas: '#0F172A',
        dark: {
          950: '#080C15',
          900: '#0F172A',
          850: '#151F32',
          800: '#1E293B',
          750: '#253349',
          700: '#334155',
          600: '#475569',
        },
        // FreshPath Primary: Heirloom Crimson
        crimson: {
          DEFAULT: '#C1121F',
          400: '#F87171',
          500: '#DC2626',
          600: '#C1121F',
          700: '#9E0E19',
          800: '#7B0B13',
        },
        // FreshPath Secondary: Emerald Vine & Chlorophyll
        emeraldVine: {
          DEFAULT: '#2E7D32',
          300: '#86EFAC',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#2E7D32',
          700: '#1B5E20',
          800: '#144617',
        },
        chlorophyll: '#4ADE80',
        // Glassmorphism System Colors
        glass: {
          surface: 'rgba(17, 24, 39, 0.65)',
          elevated: 'rgba(30, 41, 59, 0.75)',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-hover': 'rgba(255, 255, 255, 0.20)',
          light: 'rgba(255, 255, 255, 0.03)',
        },
        textPrimary: '#dae2fd',
        textSecondary: '#94A3B8',
        textMuted: 'rgba(255, 255, 255, 0.60)',
        // Retain existing legacy colors for backward compatibility
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
          400: '#FBBF24',
          500: '#F9A825',
          600: '#F57F17',
        },
        charcoal: '#1B1B1B',
        sandBg: '#FAFAF7',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glass: '0 20px 40px -15px rgba(0, 0, 0, 0.6)',
        'glass-sm': '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
        'glass-elevated': '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
        'glow-primary': '0 0 24px 0 rgba(193, 18, 31, 0.35)',
        'glow-crimson': '0 0 24px 0 rgba(193, 18, 31, 0.35)',
        'glow-success': '0 0 20px 0 rgba(74, 222, 128, 0.30)',
        'glow-emerald': '0 0 20px 0 rgba(74, 222, 128, 0.30)',
        'glow-amber': '0 0 20px 0 rgba(217, 119, 6, 0.30)',
        'glow-blue': '0 0 20px 0 rgba(2, 132, 199, 0.30)',
        'glow-purple': '0 0 20px 0 rgba(147, 51, 234, 0.30)',
      },
      backdropBlur: {
        xs: '2px',
        '2xl': '40px',
        '3xl': '64px',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'slide-up': 'slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        float: 'float 4s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.7', transform: 'scale(1.03)' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [],
}
