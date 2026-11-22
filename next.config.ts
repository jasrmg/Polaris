import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static site: no server, no backend. Output goes to ./out
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  experimental: {
    agentUpgrade: "security",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
