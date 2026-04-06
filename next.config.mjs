/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Fix for leaflet in Next.js
    config.resolve.fallback = { fs: false };
    return config;
  },
};

export default nextConfig;
