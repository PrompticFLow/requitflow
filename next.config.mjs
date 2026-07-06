/** @type {import('next').NextConfig} */
const nextConfig = {
  // Removed rewrites to prevent 404s for /dashboard routes
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
