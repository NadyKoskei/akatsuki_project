import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the workspace root — a stray lockfile further up the tree otherwise
  // makes Next infer the wrong one for file tracing. process.cwd() rather than
  // import.meta.dirname: the latter is undefined on older Node runtimes, and
  // both resolve to the project root under `next dev`, `next build` and Vercel.
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
