import type { Config } from "tailwindcss";

// The `brand` palette and `ink` reference CSS variables set from
// src/config/brand.ts, so utility classes like bg-brand-500 / text-brand-600 /
// bg-ink follow the active brand automatically.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "var(--brand-primary-50)",
          500: "var(--brand-primary)",
          600: "var(--brand-primary-dark)",
          700: "var(--brand-primary-dark)",
        },
        ink: {
          DEFAULT: "var(--brand-ink)",
          soft: "var(--brand-ink-soft)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
