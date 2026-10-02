/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // MetaApi SDK bundle'a girmesin, calisma aninda Node'un require'i ile yuklensin
    // (SDK'nin paket kokundeki "import" kosulu tarayici build'ine gidiyor).
    serverComponentsExternalPackages: ['metaapi.cloud-sdk'],
    // instrumentation.ts: sunucu acilisinda Axi mum bakicisini baslatir
    instrumentationHook: true,
  },
}
module.exports = nextConfig
