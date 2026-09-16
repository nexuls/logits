import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // draftly is imported from its TypeScript sources, one plugin per file; see
  // src/components/nodes/markdown/draftly.ts.
  transpilePackages: ["draftly"],
  allowedDevOrigins: ["10.233.203.164"],
};

export default nextConfig;
