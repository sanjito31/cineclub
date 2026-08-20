import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "a.ltrbxd.com",
        port: "",
        pathname: "/resized/avatar/**",
      },
    ],
  },
};

export default nextConfig;
