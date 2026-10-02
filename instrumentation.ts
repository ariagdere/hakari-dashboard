// Sunucu acilisinda bir kez calisir (next.config.js: experimental.instrumentationHook).
// Axi mum bakicisini hemen baslatir: deploy sonrasi grafik deposu DB'den dolar ve eksik mumlar
// kimse sayfayi acmadan tamamlanir. Hata acilisi asla engellemez.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    try {
      const { startAxiCandleKeeper } = await import('./lib/axiCandles')
      startAxiCandleKeeper()
    } catch (err) {
      console.error('[instrumentation] Axi mum bakicisi baslatilamadi:', err)
    }
  }
}
