import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  webpack: (config, { isServer, webpack: webpackInstance }) => {
    // Wallet / Privy stacks may pull packages that `require("react-native")`; ignore for web builds.
    config.plugins.push(
      new webpackInstance.IgnorePlugin({ resourceRegExp: /^react-native$/ })
    );
    // agora-rtc-sdk-ng accesses `window` at import time — never bundle it for the server.
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "agora-rtc-sdk-ng",
      ];
    }
    return config;
  },
};

export default nextConfig;
