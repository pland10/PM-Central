// Brand configuration — the single place to re-skin the hub for any company.
// Change these values (name + colors) and the whole app follows. Swap this file
// per deployment, or later drive it per account for a white-labeled product.

export interface Brand {
  name: string;
  shortName: string; // shown in the logo mark
  tagline: string;
  colors: {
    primary: string; // accent (buttons, links, active state)
    primaryDark: string; // hover / pressed
    primary50: string; // faint tint (badges, backgrounds)
    ink: string; // sidebar / dark surfaces
    inkSoft: string; // hover on dark surfaces
  };
}

// Default brand: PMI Lighthouse (black + orange).
export const BRAND: Brand = {
  name: "PMI Lighthouse",
  shortName: "PMI",
  tagline: "Property Management Hub",
  colors: {
    primary: "#F26A21", // PMI orange
    primaryDark: "#D2551A",
    primary50: "#FDEEE4",
    ink: "#0B0B0C", // black
    inkSoft: "#1D1D20",
  },
};

// Emitted into a <style> tag so every CSS variable (and the Tailwind `brand`
// palette, which references these vars) reflects the brand above.
export function brandCssVars(brand: Brand = BRAND): string {
  const c = brand.colors;
  return `:root{--brand-primary:${c.primary};--brand-primary-dark:${c.primaryDark};--brand-primary-50:${c.primary50};--brand-ink:${c.ink};--brand-ink-soft:${c.inkSoft};}`;
}
