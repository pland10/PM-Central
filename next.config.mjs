/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle (.next/standalone) so the app can run
  // in a small container on any host — Vercel, Railway, Render, Fly, a VPS.
  // Harmless on hosts that build Next.js natively.
  output: "standalone",
  images: {
    // Inspection photos live in Supabase Storage; allow next/image to optimize
    // them (resized/compressed thumbnails for the grid, full image on click).
    // Uses sharp at runtime — bundled into the standalone output.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
