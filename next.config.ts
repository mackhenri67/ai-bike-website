import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build-review images are uploaded through a Server Action (max photo 5 MB).
  // Leave a little multipart overhead above the per-file validation limit.
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  images: {
    remotePatterns: [
      // Product images uploaded by the admin panel live in Supabase Storage,
      // served from the project's *.supabase.co hostname.
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
