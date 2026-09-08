'use client'
import { useState, useRef, useEffect } from 'react'

interface FieldValue { value: number; eventTime: string }

interface Props {
  orderId: number
  field: 'sl' | 'tp'
  currentValue: number | null
  color: string
  fmtPrice: (v: number | null | undefined) => string
  onUpdated: (newValue: number) => void
}

function fmtEventTime(t: string): string {
  if (t === 'güncel') return 'güncel'
  try {
    return new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return t
  }
}

export default function EditableSlTp({ orderId, field, currentValue, color, fmtPrice, onUpdated }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [values, setValues] = useState<FieldValue[]>([])
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation() // satir secimini tetiklemesin
    if (open) { setOpen(false); return }
    setOpen(true)
    setLoading(true)
    try {
      const res = await fetch(`/api/order-field-history?orderId=${orderId}`)
      const data = await res.json()
      setValues(field === 'sl' ? data.slValues ?? [] : data.tpValues ?? [])
    } catch {
      setValues([])
    } finally {
      setLoading(false)
    }
  }

  async function handleSelect(v: number, e: React.MouseEvent) {
    e.stopPropagation()
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: v }),
      })
      if (res.ok) {
        onUpdated(v)
        setOpen(false)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }} onClick={(e) => e.stopPropagation()}>
      <span onClick={handleClick} style={{ color, cursor: 'pointer', borderBottom: '1px dotted currentColor' }} title="Geçmiş değerleri gör / düzelt">
        {fmtPrice(currentValue)}
      </span>
      {open && (
        <div className="mono" style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 50, marginTop: 4,
          background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6,
          minWidth: 160, boxShadow: '0 4px 16px rgba(0,0,0,0.4)', fontSize: 11, overflow: 'hidden',
        }}>
          <div style={{ padding: '6px 10px', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
            {field === 'sl' ? 'SL geçmişi' : 'TP geçmişi'}
          </div>
          {loading && <div style={{ padding: '8px 10px', color: 'var(--text-3)' }}>yükleniyor…</div>}
          {!loading && values.length === 0 && <div style={{ padding: '8px 10px', color: 'var(--text-3)' }}>geçmiş bulunamadı</div>}
          {!loading && values.map((v, i) => (
            <div key={i} onClick={(e) => handleSelect(v.value, e)}
              style={{
                padding: '6px 10px', cursor: saving ? 'default' : 'pointer', display: 'flex', justifyContent: 'space-between', gap: 10,
                background: currentValue != null && Math.abs(v.value - currentValue) < 0.01 ? 'var(--bg-3)' : 'transparent',
                opacity: saving ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.background = 'var(--bg-3)' }}
              onMouseLeave={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.background = currentValue != null && Math.abs(v.value - currentValue) < 0.01 ? 'var(--bg-3)' : 'transparent' }}>
              <span style={{ color }}>{fmtPrice(v.value)}</span>
              <span style={{ color: 'var(--text-3)' }}>{fmtEventTime(v.eventTime)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
