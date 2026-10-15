import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tripwire is a live, per-user, DB-backed app: classic dynamic rendering keeps
  // data flow simple. The app UI fetches from our REST route handlers.
  cacheComponents: false,
  serverExternalPackages: ["@libsql/client", "libsql", "playwright", "sharp", "pixelmatch", "pngjs", "nodemailer"],
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
