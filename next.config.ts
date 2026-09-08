import type { NextConfig } from 'next'

const config: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ['pdf-parse', 'bcryptjs', 'nodemailer'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
}

export default config
