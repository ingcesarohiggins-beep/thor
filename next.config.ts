import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.GITHUB_ACTIONS ? "/thor" : "",
  assetPrefix: process.env.GITHUB_ACTIONS ? "/thor/" : "",
  images: { unoptimized: true },
};

export default nextConfig;
