import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe6fe",
          500: "#3b6fe0",
          600: "#2f5bc4",
          700: "#2749a0",
        },
      },
    },
  },
  plugins: [],
};

export default config;
