import type { NextConfig } from "next";

const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  output: "standalone", // Required for Azure Static Web Apps
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/:path*`, // Proxy to Backend
      },
    ];
  },
};

export default nextConfig;
