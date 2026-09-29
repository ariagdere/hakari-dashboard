'use client'

import { useEffect, useState } from 'react'

type RedFolderStatus = {
  level: 'red' | 'orange' | null
  date: string | null
  events: { name: string; time_local: string; currency: string }[]
}

// 'YYYY-MM-DD' -> 'DD.MM.YYYY'
function trDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

// Skorkartlar ile mum grafiği arasına yerleşir. /api/red-folder-status'u poll eder;
// bugün (İstanbul takvimi) USD red folder haberi varsa KIRMIZI, yarın varsa TURUNCU
// bant gösterir, ikisi de yoksa hiçbir şey render etmez.
export default function RedFolderBanner() {
  const [status, setStatus] = useState<RedFolderStatus | null>(null)

  useEffect(() => {
    let active = true
    async function fetchStatus() {
      try {
        const res = await fetch('/api/red-folder-status', { cache: 'no-store' })
        if (res.ok && active) setStatus(await res.json())
      } catch {}
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 60000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  if (!status || !status.level) return null

  const isToday = status.level === 'red'
  const color = isToday ? 'var(--red)' : '#fb923c'
  const bg = isToday ? 'var(--red-dim)' : '#fb923c18'
  const border = isToday ? 'var(--red-border)' : '#fb923c40'

  const eventsText = status.events
    .map((e) => `${e.time_local} — ${e.name}`)
    .join('  ·  ')

  return (
    <div
      className="mono"
      style={{
        background: bg,
        border: `1px solid ${border}`,
        color,
        borderRadius: 6,
        padding: '8px 14px',
        marginBottom: 16,
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: 14 }}>⚠</span>
      <span style={{ fontWeight: 600 }}>
        {isToday ? 'BUGÜN' : 'YARIN'} ({status.date ? trDate(status.date) : ''}) USD Red Folder haberi var
      </span>
      <span style={{ opacity: 0.85 }}>— {eventsText}</span>
    </div>
  )
}
