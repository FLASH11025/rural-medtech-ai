import type { NextConfig } from "next";

// STATIC_EXPORT=1 (single-service deploy only) trades the dev API proxy for a
// static bundle that the Python backend serves directly.
const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = isStaticExport
  ? {
      output: "export",
      images: { unoptimized: true },
    }
  : {
      async rewrites() {
        return [
          {
            source: "/api/:path*",
            destination: "http://127.0.0.1:8000/:path*",
          },
        ];
      },
    };

export default nextConfig;
