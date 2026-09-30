/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "intensely-actual-chipmunk.ngrok-free.app"
      ]
    }
  }
};

export default nextConfig;
