/** @type {import('next').NextConfig} */
const nextConfig = {
  // MetaApi SDK bundle'a girmesin, calisma aninda Node'un require'i ile yuklensin
  // (SDK'nin paket kokundeki "import" kosulu tarayici build'ine gidiyor).
  serverExternalPackages: ['metaapi.cloud-sdk'],
  // instrumentation.ts (sunucu acilisinda Axi mum bakicisini baslatir) Next 15'ten beri ayarsiz calisir.
}
module.exports = nextConfig
