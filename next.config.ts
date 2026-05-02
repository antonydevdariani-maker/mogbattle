import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  webpack: (config, { webpack: webpackInstance }) => {
    // Wallet / Privy stacks may pull packages that `require("react-native")`; ignore for web builds.
    config.plugins.push(
      new webpackInstance.IgnorePlugin({ resourceRegExp: /^react-native$/ })
    );
return config;
  },
};

export default nextConfig;
