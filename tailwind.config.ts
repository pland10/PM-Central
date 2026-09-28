import type { Config } from "tailwindcss";

// Brand palette. Literal hex so the utilities always compile.
// Keep these in sync with src/config/brand.ts (the app also reads that directly
// for inline styles). To re-skin: change both.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#FFF1E3",
          500: "#FF6F00", // PMI orange
          600: "#E06200",
          700: "#E06200",
        },
        ink: {
          DEFAULT: "#141418", // black
          soft: "#26262E",
        },
      },
    },
  },
  plugins: [],
};

export default config;
