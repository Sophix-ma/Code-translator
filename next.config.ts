import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        source: '/api/sessions/:path*',
        destination: 'http://localhost:3003/api/sessions/:path*',
      },
      {
        source: '/ws/:path*',
        destination: 'http://localhost:3003/ws/:path*',
      },
    ];
  },
};

export default nextConfig;
