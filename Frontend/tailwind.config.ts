import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      backgroundImage: {
        'dark-gradient': 'linear-gradient(135deg, #0f0f23 0%, #1e3a8a 100%)',
      }
    }
  },
  plugins: []
} satisfies Config;
