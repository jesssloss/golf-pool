import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        augusta: '#006747',
        'augusta-dark': '#004D35',
        'masters-gold': '#FEDD00',
        cream: '#FFF8E7',
        'cream-dark': '#F5EDD6',
        'score-red': '#C41E3A',
        'score-green': '#006747',
        'muted-gray': '#9CA3AF',
      },
      fontFamily: {
        serif: ['var(--font-playfair)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
