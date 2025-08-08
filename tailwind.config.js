/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--bg))',
        fg: 'hsl(var(--fg))',
        accent: 'hsl(var(--accent))',
        muted: 'hsl(var(--muted))',
      },
      fontSize: {
        body: 'clamp(0.95rem, 0.5vw + 0.85rem, 1.1rem)',
        heading: 'clamp(1.25rem, 2.5vw + 1rem, 2.5rem)',
      },
    },
  },
  plugins: [],
}

