import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The link-preview route reads its static TTFs from disk at module load (Mosaic §6).
  outputFileTracingIncludes: { "/b/[id]/og": ["./assets/og/*.ttf"] },
};

export default nextConfig;
