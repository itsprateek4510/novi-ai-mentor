/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // In dev the Next server runs on :3000; proxy all API + static asset
    // traffic to the FastAPI backend on :8000 (same as the old Vite proxy).
    return [
      { source: "/api/:path*", destination: "http://localhost:8000/api/:path*" },
      { source: "/static/:path*", destination: "http://localhost:8000/static/:path*" },
    ];
  },
};

export default nextConfig;