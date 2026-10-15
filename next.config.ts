import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.DISCOVERY_TEST_DIST_DIR || ".next",
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
