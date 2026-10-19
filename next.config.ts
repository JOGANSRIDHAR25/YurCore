import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  allowedDevOrigins: ["192.168.1.35", "192.168.1.35:3000", "localhost:3000"],
};

export default nextConfig;
