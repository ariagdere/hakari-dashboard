'use client'

import { useEffect, useState } from 'react'
import type { ElleZone } from '@/lib/elleZoneLayer'
import type { ZoneConflict, ZoneRule, ZoneWarning } from '@/lib/zoneRules'

// /live grafiginin altinda zon ekleme / duzenleme paneli: cizimde ipucu; taslak varken ust/alt fiyat, genislik,
// kirilma takibi, miknatis, cakisan zonlar (pasife alinacaklar isaretli) ve uyarilar; kaydetmeden once onay ozeti.
// Paralel sistemin Piyasa grafigindeki panelin (apps/web/components/chart/ZonePanel.tsx) /live gorunumu.

const f2 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 })
const f0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
const round2 = (v: number) => Math.round(v * 100) / 100
const dm = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short' })

// "74250", "74250,5", "74.250,5", "74,250.5" -> sayi
export function parsePrice(text: string): number | null {
  let t = text.trim().replace(/\s|\$/g, '')
  if (!t) return null
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  else if (t.includes(',')) t = t.replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  const v = Number(t)
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null
}

export type ZonePanelProps = {
  mode: 'draw' | 'adjust'
  editId: number | null
  editZone: ElleZone | null // duzenlenen zon (baska ekrandan kapandiysa null)
  first: number | null
  draft: { lo: number; hi: number } | null
  rule: ZoneRule | null
  conflicts: ZoneConflict[]
  keep: Set<number> // cakisip kalacak (isareti kaldirilmis) zonlar
  warnings: ZoneWarning[]
  breaksFrom: string // YYYY-MM-DD (Istanbul)
  magnet: boolean
  confirm: 'save' | 'end' | null
  busy: boolean
  error: string | null
  onDraft: (lo: number, hi: number) => void
  onKeep: (id: number, keep: boolean) => void
  onBreaksFrom: (d: string) => void
  onMagnet: (on: boolean) => void
  onSave: () => void
  onEnd: () => void
  onBack: () => void
  onCancel: () => void
}

const CSS = `
.zp { margin-top: 10px; padding: 12px 14px; border: 1px solid var(--border-2); border-radius: 8px; background: var(--bg-2); font-family: 'DM Mono', monospace; font-size: 12px; display: grid; gap: 9px; }
.zp-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.zp-title { letter-spacing: 0.08em; color: var(--text); }
.zp-hint, .zp-muted { color: var(--text-3); font-size: 11px; }
.zp-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px 12px; }
.zp-field { display: grid; gap: 3px; color: var(--text-3); font-size: 10px; letter-spacing: 0.06em; }
.zp-field input { width: 120px; box-sizing: border-box; background: var(--bg-3); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-size: 12px; padding: 5px 8px; min-height: 30px; font-family: 'DM Mono', monospace; }
.zp-field input[type='date'] { width: auto; color-scheme: dark; }
.zp-width { color: var(--text-3); padding-bottom: 7px; }
.zp-check { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; cursor: pointer; }
.zp-check input { accent-color: var(--amber); width: 14px; height: 14px; }
.zp-conflicts { border: 1px solid var(--amber-border); border-radius: 6px; padding: 8px 10px; display: grid; gap: 5px; margin: 0; }
.zp-conflicts legend { color: var(--amber); font-size: 10px; letter-spacing: 0.06em; padding: 0 4px; }
.zp-summary { margin: 0; padding-left: 16px; display: grid; gap: 4px; }
.zp-warn { color: var(--amber); }
.zp-error { color: var(--red); }
.zp-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.zp-actions .filter-btn { font-size: 12px; padding: 5px 14px; }
.zp-primary { background: var(--text) !important; color: var(--bg) !important; border-color: var(--text) !important; }
.zp-actions .filter-btn:disabled { opacity: 0.55; cursor: default; }
`

// Yazilan fiyat cikinca ya da Enter'da islenir (her tusta degil: yazarken bant yerinden oynamasin). Ilk Enter fiyati
// isler, degismemis fiyatta Enter kaydetmeye gider.
function PriceInput({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(f2.format(value))
  const [focus, setFocus] = useState(false)
  useEffect(() => {
    if (!focus) setText(f2.format(value))
  }, [value, focus])
  const commit = () => {
    const v = parsePrice(text)
    if (v === null || v === value) return false
    onCommit(v)
    return true
  }
  return (
    <label className="zp-field">
      <span>{label}</span>
      <input
        inputMode="decimal"
        value={text}
        aria-label={`${label} fiyat`}
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false)
          if (!commit()) setText(f2.format(value))
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && commit()) e.stopPropagation()
        }}
      />
    </label>
  )
}

export function ZonePanel(p: ZonePanelProps) {
  const d = p.draft
  const editId = p.editId
  const editFrom = p.editZone?.breaksFrom ? dm.format(p.editZone.breaksFrom) : '—'
  const title = editId !== null ? `#${editId} DÜZENLENİYOR` : 'YENİ ZON'
  const ended = p.conflicts.filter((c) => !p.keep.has(c.id))
  const kept = p.conflicts.filter((c) => p.keep.has(c.id))
  const conflictText = (c: ZoneConflict) =>
    c.kind === 'kesisiyor' ? 'kesişiyor' : `arası ${f0.format(c.gap)} $ (eşik ${f0.format(p.rule?.threshold ?? 0)} $)`

  if (p.confirm) {
    return (
      <div className="zp" data-testid="zone-panel" aria-live="polite">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <span className="zp-title">ONAY</span>
        <ul className="zp-summary">
          {p.confirm === 'end' && (
            <li>
              #{editId} {p.editZone ? `${f2.format(p.editZone.lo)}–${f2.format(p.editZone.hi)} ` : ''}pasife alınacak; yerine zon eklenmeyecek.
            </li>
          )}
          {p.confirm === 'save' && d && (
            <>
              <li>
                Yeni zon {f2.format(d.lo)}–{f2.format(d.hi)} eklenecek: kaydedildiği andan geçerli, kırılma takibi başlangıcı{' '}
                {editId !== null ? `${editFrom} (#${editId} ile aynı)` : dm.format(Date.parse(`${p.breaksFrom}T00:00:00+03:00`))}.
              </li>
              {editId !== null && <li>#{editId} pasife alınacak (düzenleme).</li>}
              {ended.map((c) => (
                <li key={c.id}>
                  #{c.id} {f2.format(c.lo)}–{f2.format(c.hi)} pasife alınacak ({conflictText(c)}).
                </li>
              ))}
              {kept.map((c) => (
                <li key={c.id}>
                  #{c.id} kalacak; yeni zonla {conflictText(c)}.
                </li>
              ))}
              {p.warnings.map((w) => (
                <li key={w.code} className="zp-warn">
                  {w.text}.
                </li>
              ))}
            </>
          )}
        </ul>
        <span className="zp-hint">SDL değişikliği en geç 1 dakikada görür; açık pozisyonların SL/TP&apos;si değişmez.</span>
        {p.error && (
          <span className="zp-error" role="alert">
            {p.error}
          </span>
        )}
        <div className="zp-actions">
          <button type="button" className="filter-btn zp-primary" onClick={p.confirm === 'end' ? p.onEnd : p.onSave} disabled={p.busy}>
            {p.busy ? 'Kaydediliyor…' : 'Onayla'}
          </button>
          <button type="button" className="filter-btn" onClick={p.onBack} disabled={p.busy}>
            Geri
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="zp" data-testid="zone-panel">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="zp-head">
        <span className="zp-title">{title}</span>
        <label className="zp-check">
          <input type="checkbox" checked={p.magnet} onChange={(e) => p.onMagnet(e.target.checked)} />
          Mıknatıs
        </label>
      </div>
      {!d ? (
        <span className="zp-hint">
          {p.first === null
            ? 'Grafikte basılı tutup dikey sürükle ya da üst ve alt sınıra ayrı ayrı tıkla. Esc: vazgeç.'
            : `İlk sınır ${f2.format(p.first)}; şimdi diğer sınıra tıkla.`}
        </span>
      ) : (
        <>
          <div className="zp-row">
            {/* yazilan kenar digerini gecerse bant genisligi korunarak tasinir */}
            <PriceInput label="ÜST" value={d.hi} onCommit={(v) => p.onDraft(v > d.lo ? d.lo : round2(v - (d.hi - d.lo)), v)} />
            <PriceInput label="ALT" value={d.lo} onCommit={(v) => p.onDraft(v, v < d.hi ? d.hi : round2(v + (d.hi - d.lo)))} />
            <span className="zp-width">
              {f2.format(d.hi - d.lo)} $ · %{((100 * (d.hi - d.lo)) / d.lo).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
            </span>
            {editId === null ? (
              <label className="zp-field">
                <span>KIRILMA TAKİBİ BAŞLANGICI</span>
                <input
                  type="date"
                  value={p.breaksFrom}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => e.target.value && p.onBreaksFrom(e.target.value)}
                />
              </label>
            ) : (
              <span className="zp-hint" style={{ paddingBottom: 7 }}>
                Kırılma takibi başlangıcı: {editFrom} (#{editId} ile aynı).
              </span>
            )}
          </div>
          <span className="zp-hint">Kenarları grafikte sürükleyerek ya da kutulara yazarak ayarla. Enter: kaydet, Esc: vazgeç.</span>
          {p.conflicts.length > 0 && (
            <fieldset className="zp-conflicts">
              <legend>ÇAKIŞAN ZONLAR: İŞARETLİLER PASİFE ALINIR</legend>
              {p.conflicts.map((c) => (
                <label key={c.id} className="zp-check">
                  <input type="checkbox" checked={!p.keep.has(c.id)} onChange={(e) => p.onKeep(c.id, !e.target.checked)} />
                  <span>
                    #{c.id} {f2.format(c.lo)}–{f2.format(c.hi)}
                  </span>
                  <span className="zp-muted">{conflictText(c)}</span>
                </label>
              ))}
            </fieldset>
          )}
          {p.warnings.length > 0 && (
            <ul className="zp-summary">
              {p.warnings.map((w) => (
                <li key={w.code} className="zp-warn">
                  {w.text}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {p.error && (
        <span className="zp-error" role="alert">
          {p.error}
        </span>
      )}
      <div className="zp-actions">
        {d && (
          <button type="button" className="filter-btn zp-primary" onClick={p.onSave} disabled={p.busy || !p.rule}>
            Kaydet
          </button>
        )}
        {editId !== null && (
          <button type="button" className="filter-btn" onClick={p.onEnd} disabled={p.busy}>
            Pasife al
          </button>
        )}
        <button type="button" className="filter-btn" onClick={p.onCancel} disabled={p.busy}>
          Vazgeç
        </button>
      </div>
    </div>
  )
}
