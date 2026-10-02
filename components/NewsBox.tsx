'use client'

import { useEffect, useState } from 'react'

// /live ekraninda skorkartlarin altindaki satirin 1/3'luk sag kismi (eski RedFolderBanner'in yerini aldi).
// /api/red-folder-status'u poll eder; bugunun ve yarinin USD red folder haberlerini listeler,
// ikisi de yoksa "No upcoming news" yazar. Bugun saati gecmis haberler soluk gosterilir.
// Not: saat karsilastirmalari 'HH:MM' metni uzerinden; Istanbul sabit UTC+3.

type RedFolderEvent = { name: string; time_local: string; currency: string }
type DayEvents = { date: string; events: RedFolderEvent[] }
type Status = { today?: DayEvents; tomorrow?: DayEvents }

// 'YYYY-MM-DD' -> 'DD.MM'
const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

// Istanbul (UTC+3) su anki 'HH:MM'
function istanbulHHMM(now: number): string {
  return new Date(now + 3 * 3600 * 1000).toISOString().slice(11, 16)
}

function DayBlock({ label, day, accent, passedBefore }: { label: string; day: DayEvents; accent: string; passedBefore?: string }) {
  return (
    <div style={{ borderLeft: `2px solid ${accent}`, paddingLeft: 10 }}>
      <div className="mono" style={{ fontSize: 11, color: accent, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 6 }}>
        {label} · {shortDate(day.date)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {day.events.map((e, i) => {
          const passed = passedBefore != null && e.time_local < passedBefore
          return (
            <div
              key={i}
              className="mono"
              style={{ display: 'flex', gap: 10, fontSize: 12, lineHeight: 1.4, opacity: passed ? 0.45 : 1 }}
              title={passed ? 'Saati geçti' : undefined}
            >
              <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{e.time_local}</span>
              <span style={{ color: 'var(--text)', minWidth: 0 }}>{e.name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function NewsBox() {
  const [status, setStatus] = useState<Status | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let active = true
    async function fetchStatus() {
      try {
        const res = await fetch('/api/red-folder-status', { cache: 'no-store' })
        if (res.ok && active) setStatus(await res.json())
      } catch {}
      if (active) setNow(Date.now())
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 60000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  const today = status?.today
  const tomorrow = status?.tomorrow
  const hasToday = !!today && today.events.length > 0
  const hasTomorrow = !!tomorrow && tomorrow.events.length > 0
  const nowHHMM = istanbulHHMM(now)
  // Eski RedFolderBanner'in uyari islevi: bugun saati gelmemis haber varsa kirmizi,
  // yoksa yarin haber varsa turuncu cerceve.
  const urgency = hasToday && today!.events.some((e) => e.time_local >= nowHHMM)
    ? ' is-today'
    : hasTomorrow ? ' is-tomorrow' : ''

  return (
    <div className={`stat-card macro-news-box${urgency}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <span className="col-label" style={{ fontSize: 11 }}>NEWS</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>USD RED FOLDER</span>
      </div>

      {!status ? (
        <div className="mono" style={{ fontSize: 13, color: 'var(--text-3)' }}>Yükleniyor…</div>
      ) : !hasToday && !hasTomorrow ? (
        <div className="macro-news-empty mono">No upcoming news</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {hasToday && <DayBlock label="BUGÜN" day={today!} accent="var(--red)" passedBefore={nowHHMM} />}
          {hasTomorrow && <DayBlock label="YARIN" day={tomorrow!} accent="#fb923c" />}
        </div>
      )}
    </div>
  )
}
