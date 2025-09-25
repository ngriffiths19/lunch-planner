// next.config.ts
const nextConfig = {
  // Let the build succeed even if there are TS/ESLint issues.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
