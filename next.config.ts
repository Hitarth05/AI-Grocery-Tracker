import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Next defaults Server Action bodies to 1 MB, which every phone photo
    // exceeds. The rejection is a 413 thrown before the action runs, so its
    // redirects never fire and the user sees a raw server error. Uploads are
    // downscaled client-side; this is the backstop for anything that skips
    // that path. 4 MB stays under Vercel's 4.5 MB request cap.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
