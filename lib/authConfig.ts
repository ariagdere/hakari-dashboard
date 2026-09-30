// Basic Auth yapilandirmasi -- middleware.ts ve hassas route'lar ayni kaynagi okur.
//
// middleware.ts, degiskenler TANIMLI DEGILSE istekleri gecirir (deploy sonrasi
// dashboard'a erisim kilitlenmesin diye). Buna karsilik canli fiyat, hesap bilgisi
// ya da emir gibi HASSAS route'lar isBasicAuthConfigured() false iken HIC calismaz
// (503 doner) -- auth kapaliyken bu veriler asla disari acilmaz.
export function isBasicAuthConfigured(): boolean {
  const user = process.env.DASHBOARD_BASIC_AUTH_USER
  const pass = process.env.DASHBOARD_BASIC_AUTH_PASSWORD
  return typeof user === 'string' && user.length > 0 && typeof pass === 'string' && pass.length > 0
}

export const AUTH_NOT_CONFIGURED_MESSAGE =
  'Basic Auth yapılandırılmamış (DASHBOARD_BASIC_AUTH_USER / DASHBOARD_BASIC_AUTH_PASSWORD). Bu endpoint auth olmadan çalışmaz.'
