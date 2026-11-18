/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    dirs: ['src', 'tests'],
  },
  experimental: {
    serverComponentsExternalPackages: ['@node-rs/argon2', '@prisma/adapter-pg', '@prisma/client'],
  },
};

export default nextConfig;
