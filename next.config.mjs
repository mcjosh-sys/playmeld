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
  webpack: (config, { isServer }) => {
    // Ignore optional BullMQ dependency that causes warning
    // @valkey/valkey-glide is optional and not needed for ioredis
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        "@valkey/valkey-glide": "commonjs @valkey/valkey-glide",
      });
    }
    // Also ignore it via alias to prevent bundling attempt
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias["@valkey/valkey-glide"] = false;

    return config;
  },
};

export default nextConfig;
