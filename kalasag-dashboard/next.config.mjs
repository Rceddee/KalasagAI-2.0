/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
    remotePatterns: [
      new URL("https://images.unsplash.com/**"),
      new URL("https://**.googleusercontent.com/**"),
      new URL("https://firebasestorage.googleapis.com/**"),
      new URL("https://res.cloudinary.com/**"),
    ],
  },
};

export default nextConfig;
