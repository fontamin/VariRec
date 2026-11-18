import type { NextConfig } from "next";

// VariRec is a pure client-side app, so `next build` emits a fully static
// site into `out/` (the folder that contains the main index.html). The GitHub
// Pages workflow (.github/workflows/deploy.yml) publishes exactly that folder.
//
// GitHub Pages project sites are served from https://<user>.github.io/<repo>/.
// The deploy workflow sets NEXT_PUBLIC_BASE_PATH to "/<repo-name>"; locally
// (no env var) the app keeps working at the root, e.g. http://localhost:3000/.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  images: {
    // Required by `output: "export"`: there is no image-optimization server
    // on GitHub Pages.
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
