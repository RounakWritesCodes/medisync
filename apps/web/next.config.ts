import type { NextConfig } from 'next'

const API_INTERNAL = process.env.API_INTERNAL_URL || 'http://api:3001'

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_INTERNAL}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
