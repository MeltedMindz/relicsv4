/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This starter is a static-friendly educational app. No server secrets are used by the core
  // flows; all on-chain reads happen client-side via a public RPC. Never put a signing secret
  // in the hosting provider's environment — see docs/18-faq.md and SECURITY.md.
};

export default nextConfig;
