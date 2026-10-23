import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App 100% autenticada y dinámica: sin Cache Components cada página se renderiza por request.
  serverExternalPackages: ["node-forge"],
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
