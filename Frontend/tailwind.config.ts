import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{astro,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "dark-gradient": "linear-gradient(155deg, #020617 0%, #0b1120 48%, #111827 100%)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(148, 163, 184, 0.24), 0 22px 40px -24px rgba(15, 23, 42, 0.58)",
      },
    },
  },
  plugins: [],
} satisfies Config;
