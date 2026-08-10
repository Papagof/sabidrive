/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@tripme/ui", "@tripme/supabase"]
};

export default nextConfig;
