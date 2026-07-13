/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/ollama/:path*',
        destination: `${process.env.OLLAMA_API_URL || 'http://ollama-engine:11434'}/:path*`,
      },
      {
        source: '/api/vllm/:path*',
        destination: `${process.env.VLLM_API_URL || 'http://vllm-engine:8000/v1'}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
// reload comment to force next.js restart

