/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle (.next/standalone) so the app can run
  // in a small container on any host — Vercel, Railway, Render, Fly, a VPS.
  // Harmless on hosts that build Next.js natively.
  output: "standalone",
};

export default nextConfig;
