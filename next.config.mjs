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
};

export default nextConfig;
