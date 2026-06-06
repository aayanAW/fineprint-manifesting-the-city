import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; keep it external to the server bundle.
  serverExternalPackages: ["better-sqlite3"],
  // Stray lockfile in ~ confuses workspace-root inference; pin root here.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
