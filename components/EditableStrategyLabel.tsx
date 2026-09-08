'use client'
import { useState, useRef, useEffect } from 'react'

interface Props {
  orderId: number
  currentLabel: string
  allLabels: string[]
  onUpdated: (newLabel: string) => void
  onNewLabelAdded: (label: string) => void
}

export default function EditableStrategyLabel({ orderId, currentLabel, allLabels, onUpdated, onNewLabelAdded }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setNewLabel('') }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  async function applyLabel(label: string) {
    const trimmed = label.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy_label: trimmed }),
      })
      if (res.ok) {
        onUpdated(trimmed)
        if (!allLabels.includes(trimmed)) onNewLabelAdded(trimmed)
        setOpen(false)
        setNewLabel('')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }} onClick={(e) => e.stopPropagation()}>
      <span onClick={() => setOpen((v) => !v)} style={{ cursor: 'pointer', borderBottom: '1px dotted currentColor' }} title="Strateji etiketini değiştir">
        {currentLabel}
      </span>
      {open && (
        <div className="mono" style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: 4,
          background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6,
          minWidth: 180, maxHeight: 260, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', fontSize: 11,
        }}>
          {allLabels.map((label) => (
            <div key={label} onClick={() => applyLabel(label)}
              style={{
                padding: '6px 10px', cursor: saving ? 'default' : 'pointer',
                background: label === currentLabel ? 'var(--bg-3)' : 'transparent', opacity: saving ? 0.5 : 1,
                color: 'var(--text-2)',
              }}
              onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.background = 'var(--bg-3)' }}
              onMouseLeave={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.background = label === currentLabel ? 'var(--bg-3)' : 'transparent' }}>
              {label}
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', padding: 6, display: 'flex', gap: 4 }}>
            <input
              type="text" value={newLabel} placeholder="yeni etiket" autoFocus={allLabels.length === 0}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyLabel(newLabel) }}
              onClick={(e) => e.stopPropagation()}
              style={{ flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 11, padding: '4px 6px', borderRadius: 4, minWidth: 0 }} />
            <button onClick={() => applyLabel(newLabel)} disabled={saving || !newLabel.trim()} className="filter-btn" style={{ fontSize: 10, padding: '4px 8px' }}>
              Ekle
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
