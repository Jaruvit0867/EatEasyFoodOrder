import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const devBackendUrl = "http://127.0.0.1:8000";

export default function createNextConfig(phase: string): NextConfig {
  const config: NextConfig = {
    output: "export",
  };

  if (phase === PHASE_DEVELOPMENT_SERVER) {
    config.rewrites = async () => [
      {
        source: "/api/:path*",
        destination: `${devBackendUrl}/:path*`,
      },
    ];
  }

  return config;
}
