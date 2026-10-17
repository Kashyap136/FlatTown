/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  images: {
    // Remote image hosts the API can return URLs for.
    //
    // `res.cloudinary.com` covers every Cloudinary upload (property images, floor
    // plans, brochures). An arbitrary `CLOUDINARY_CLOUD` env var is allowed so a
    // project can pin its own cloud name without a code change.
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' },
      ...(process.env.CLOUDINARY_CLOUD
        ? [
            {
              protocol: 'https',
              hostname: `res.cloudinary.com`,
              pathname: `/${process.env.CLOUDINARY_CLOUD}/**`,
            },
          ]
        : []),
      // Placeholder photography used by the seed dataset.
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      // Development media fallback served by the API from ./uploads.
      { protocol: 'http', hostname: 'localhost', pathname: '/uploads/**' },
      { protocol: 'http', hostname: '127.0.0.1', pathname: '/uploads/**' },
    ],
    // Cloudinary already serves optimally-sized derivatives, so let the
    // optimiser request them and avoid double-compression.
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [320, 375, 414, 480, 640, 768, 1024, 1280, 1440, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  eslint: {
    dirs: ['app', 'components', 'hooks', 'lib', 'store'],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
