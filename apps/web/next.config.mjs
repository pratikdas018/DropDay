/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @dropday/shared ships raw TypeScript source (no build step), so Next must
  // compile it as part of the app bundle.
  transpilePackages: ["@dropday/shared"],
};

export default nextConfig;
