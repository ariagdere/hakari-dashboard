'use client'
import { useState, useEffect } from 'react'
import type { FvgParams } from '@/lib/fvgEngine'

interface Preset {
  id: number
  name: string
  params: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface Props {
  currentParams: FvgParams
  onLoad: (params: FvgParams) => void
}

export default function FvgLabPresets({ currentParams, onLoad }: Props) {
  const [presets, setPresets] = useState<Preset[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [naming, setNaming] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function refresh() {
    try {
      const res = await fetch('/api/fvg-lab/presets')
      const data = await res.json()
      setPresets(data.presets ?? [])
    } catch {
      // Sessizce gec -- preset listesi olmadan da panel calismaya devam eder
    }
  }

  useEffect(() => { refresh() }, [])

  function handleSelect(id: string) {
    setSelectedId(id)
    if (!id) return
    const preset = presets.find((p) => String(p.id) === id)
    if (preset) onLoad(preset.params as unknown as FvgParams)
  }

  async function handleSave() {
    const trimmed = nameInput.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const res = await fetch('/api/fvg-lab/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, params: currentParams }),
      })
      const data = await res.json()
      if (data.preset) {
        await refresh()
        setSelectedId(String(data.preset.id))
        setNaming(false)
        setNameInput('')
      }
    } catch {
      // Basarisiz olursa form acik kalir, kullanici tekrar deneyebilir
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedId) return
    setDeleting(true)
    try {
      await fetch(`/api/fvg-lab/presets/${selectedId}`, { method: 'DELETE' })
      setSelectedId('')
      await refresh()
    } catch {
      // Sessizce gec
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <select
        value={selectedId}
        onChange={(e) => handleSelect(e.target.value)}
        className="mono"
        style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 10, padding: '4px 6px', borderRadius: 4, maxWidth: 160 }}>
        <option value="">Preset seç…</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      {selectedId && (
        <button onClick={handleDelete} disabled={deleting} title="Seçili preseti sil"
          className="filter-btn" style={{ fontSize: 10, padding: '4px 8px', color: 'var(--red)' }}>
          {deleting ? '…' : 'Sil'}
        </button>
      )}

      {!naming ? (
        <button onClick={() => setNaming(true)} className="filter-btn" style={{ fontSize: 10, padding: '4px 10px' }}>
          Preset kaydet
        </button>
      ) : (
        <>
          <input
            type="text" value={nameInput} placeholder="Preset adı" autoFocus
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setNaming(false); setNameInput('') } }}
            className="mono"
            style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 10, padding: '4px 6px', borderRadius: 4, width: 120 }} />
          <button onClick={handleSave} disabled={saving || !nameInput.trim()} className="filter-btn" style={{ fontSize: 10, padding: '4px 10px' }}>
            {saving ? '…' : 'Kaydet'}
          </button>
          <button onClick={() => { setNaming(false); setNameInput('') }} className="filter-btn" style={{ fontSize: 10, padding: '4px 8px' }}>
            İptal
          </button>
        </>
      )}
    </div>
  )
}
