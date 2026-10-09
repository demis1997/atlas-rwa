import { resolve } from "node:path";
import type { NextConfig } from "next";
const config: NextConfig = {
  turbopack: { root: resolve(process.cwd()) },
  outputFileTracingRoot: resolve(process.cwd()),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:3001/api/:path*",
      },
    ];
  },
};
export default config;
