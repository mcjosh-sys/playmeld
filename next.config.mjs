/** @type {import('next').NextConfig} */
const nextConfig = {
  // For Docker containerization
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "intensely-actual-chipmunk.ngrok-free.app",
        "*.vercel.app",
      ]
    }
  },
  // For Vercel deployment, keep dynamic
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.spotify.com",
      },
      {
        protocol: "https",
        hostname: "**.scdn.co",
      },
      {
        protocol: "https",
        hostname: "**.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "**.githubusercontent.com",
      },
    ],
  },
  async redirects() {
    return [
      // Redirect old routes (from route group) to new /dashboard/* structure
      {
        source: "/connections",
        destination: "/dashboard/connections",
        permanent: true,
      },
      {
        source: "/playlists",
        destination: "/dashboard/playlists",
        permanent: true,
      },
      {
        source: "/syncs",
        destination: "/dashboard/syncs",
        permanent: true,
      },
      {
        source: "/settings",
        destination: "/dashboard/settings",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
