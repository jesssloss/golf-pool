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
        pimento: '#006747',
        'pimento-dark': '#004D35',
        cheddar: '#FEDD00',
        cream: '#FFF8E7',
        'cream-dark': '#F5EDD6',
        'score-red': '#C41E3A',
        'score-green': '#006747',
        'muted-gray': '#6B7280',
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
