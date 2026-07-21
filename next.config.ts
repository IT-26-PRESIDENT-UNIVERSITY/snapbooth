import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/snapbooth',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
