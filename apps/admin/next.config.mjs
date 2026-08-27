/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: ["@sabidrive/ui", "@sabidrive/supabase"]
};

export default nextConfig;
