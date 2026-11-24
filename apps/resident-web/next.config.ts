import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIST_DIR || ".next",
  transpilePackages: ["@kalasag/shared-validation"],
};

export default nextConfig;
