// Panel emirlerinin kimligi -- dashboard (emir route'u, reconcile) ve
// metaapi-webhook/mt5_order_monitor.js ayni kurallari kullanir; birinde degisirse digerinde de degismeli.
//
// clientId bicimi: HK_<10 karakter a-z0-9>_1
//   MetaApi clientId'yi "<strateji>_<pozisyon>_<emir>" olarak bekliyor ve SL/TP ile kapanan
//   islemlerde son parcayi MT emir id'siyle degistirebiliyor. Bu yuzden eslestirme ilk iki
//   parca (client_key = HK_<anahtar>) uzerinden yapilir.
//   comment bos gonderilir; comment + clientId toplam 26 karakteri gecemez.
export const PANEL_MAGIC = 9100

export const CLIENT_ID_RE = /^HK_[a-z0-9]{10}_1$/

export function clientKeyOf(clientId: string | null | undefined): string | null {
  if (typeof clientId !== 'string' || !clientId.startsWith('HK_')) return null
  const parts = clientId.split('_')
  if (parts.length < 2 || !/^[a-z0-9]{10}$/.test(parts[1])) return null
  return `${parts[0]}_${parts[1]}`
}

// Tarayicida ve Node'da calisir (Web Crypto).
export function newClientId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  let key = ''
  for (let i = 0; i < bytes.length; i++) key += alphabet[bytes[i] % alphabet.length]
  return `HK_${key}_1`
}
