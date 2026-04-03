'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'

// ─── Data ────────────────────────────────────────────────────────────────────

const ACCOUNT = 3000

const STRATEGIES: Record<string, { name: string; emoji: string; type: 'credit' | 'debit' }> = {
  long_call:        { name: 'Long Call',        emoji: '📈', type: 'debit'  },
  long_put:         { name: 'Long Put',         emoji: '📉', type: 'debit'  },
  bull_put_spread:  { name: 'Bull Put Spread',  emoji: '🟢', type: 'credit' },
  bear_call_spread: { name: 'Bear Call Spread', emoji: '🔴', type: 'credit' },
  bull_call_spread: { name: 'Bull Call Spread', emoji: '⬆️', type: 'debit'  },
  bear_put_spread:  { name: 'Bear Put Spread',  emoji: '⬇️', type: 'debit'  },
  iron_condor:      { name: 'Iron Condor',      emoji: '🦅', type: 'credit' },
  short_put:        { name: 'Short Put',        emoji: '💰', type: 'credit' },
}

const TIMEFRAMES = [
  { id: 'short', label: '0-14 Gün',  sub: 'Kısa vade' },
  { id: 'mid',   label: '14-30 Gün', sub: 'Orta vade' },
  { id: 'long',  label: '30-60 Gün', sub: 'Uzun vade' },
]

const CRITERIA = [
  { id: 'market_trend', label: 'Piyasa Trendi (SPY/QQQ)', category: 'market', options: [
    { value: 'strong_bull', label: 'Güçlü Boğa' }, { value: 'mild_bull', label: 'Hafif Boğa' },
    { value: 'neutral', label: 'Nötr / Yatay' }, { value: 'mild_bear', label: 'Hafif Ayı' },
    { value: 'strong_bear', label: 'Güçlü Ayı' },
  ]},
  { id: 'vix_level', label: 'VIX Seviyesi', category: 'market', options: [
    { value: 'low', label: 'Düşük (<16)' }, { value: 'medium', label: 'Orta (16-25)' },
    { value: 'high', label: 'Yüksek (25-35)' }, { value: 'extreme', label: 'Çok Yüksek (35+)' },
  ]},
  { id: 'iv_rank', label: 'Hisse IV Rank', category: 'stock', options: [
    { value: 'low', label: 'Düşük (<%30)' }, { value: 'medium', label: 'Orta (%30-50)' },
    { value: 'high', label: 'Yüksek (%50-70)' }, { value: 'very_high', label: 'Çok Yüksek (>%70)' },
  ]},
  { id: 'stock_trend', label: 'Hisse Teknik Yönü', category: 'stock', options: [
    { value: 'strong_up', label: 'Güçlü Yükseliş' }, { value: 'mild_up', label: 'Hafif Yükseliş' },
    { value: 'sideways', label: 'Yatay / Kanal' }, { value: 'mild_down', label: 'Hafif Düşüş' },
    { value: 'strong_down', label: 'Güçlü Düşüş' },
  ]},
  { id: 'support_resistance', label: 'Destek / Direnç Netliği', category: 'stock', options: [
    { value: 'very_clear', label: 'Çok Net' }, { value: 'clear', label: 'Belirgin' },
    { value: 'moderate', label: 'Orta' }, { value: 'unclear', label: 'Belirsiz' },
  ]},
  { id: 'earnings', label: 'Earnings Yakınlığı', category: 'stock', options: [
    { value: 'clear', label: 'Uzak (>3 hafta)' }, { value: 'caution', label: 'Yaklaşıyor (1-3 hafta)' },
    { value: 'danger', label: 'Çok Yakın (<1 hafta)' },
  ]},
  { id: 'price_at_level', label: 'Fiyat Nerede?', category: 'stock', options: [
    { value: 'at_support', label: 'Destek Seviyesinde' }, { value: 'mid_range', label: 'Ortada / Range İçi' },
    { value: 'at_resistance', label: 'Direnç Seviyesinde' }, { value: 'breakout_up', label: 'Yukarı Kırılım' },
    { value: 'breakdown', label: 'Aşağı Kırılım' },
  ]},
]

// ─── Scoring ─────────────────────────────────────────────────────────────────

type ScoreMap = Record<string, { score: number; reasons: string[]; warnings: string[] }>

function getCapitalMetrics(price: number) {
  if (!price || price <= 0) return null
  const putCollateral = price * 100
  const putCollateralPct = (putCollateral / ACCOUNT) * 100
  const longCost = price * 0.05 * 100
  const longCostPct = (longCost / ACCOUNT) * 100
  const spread2Pct = (200 / ACCOUNT) * 100
  const spread5Pct = (500 / ACCOUNT) * 100
  return { putCollateral, putCollateralPct, longCost, longCostPct, spread2Pct, spread5Pct, price }
}

function getBaseScores(s: Record<string, string>, stockPrice: number): ScoreMap {
  const sc: ScoreMap = {}
  Object.keys(STRATEGIES).forEach(k => { sc[k] = { score: 0, reasons: [], warnings: [] } })
  const add = (k: string, p: number, r: string) => { sc[k].score += p; sc[k].reasons.push(r) }
  const pen = (k: string, p: number, r: string) => { sc[k].score -= p; sc[k].warnings.push(r) }

  // IV Rank
  if (s.iv_rank === 'low') {
    add('long_call',3,'Düşük IV → ucuz opsiyon alımı'); add('long_put',3,'Düşük IV → ucuz opsiyon alımı')
    add('bull_call_spread',3,'Düşük IV → ucuz debit spread'); add('bear_put_spread',3,'Düşük IV → ucuz debit spread')
    pen('iron_condor',3,'Düşük IV → toplanan prim yetersiz'); pen('bull_put_spread',2,'Düşük IV → düşük prim')
    pen('bear_call_spread',2,'Düşük IV → düşük prim'); pen('short_put',2,'Düşük IV → düşük prim')
  } else if (s.iv_rank === 'medium') {
    add('long_call',1,'Orta IV → kabul edilebilir'); add('long_put',1,'Orta IV → kabul edilebilir')
    add('bull_put_spread',1,'Orta IV → makul prim'); add('bear_call_spread',1,'Orta IV → makul prim')
    add('bull_call_spread',1,'Orta IV → kabul edilebilir'); add('bear_put_spread',1,'Orta IV → kabul edilebilir')
  } else if (s.iv_rank === 'high' || s.iv_rank === 'very_high') {
    const p = s.iv_rank === 'very_high' ? 4 : 3
    add('bull_put_spread',p,'Yüksek IV → yüksek prim'); add('bear_call_spread',p,'Yüksek IV → yüksek prim')
    add('iron_condor',p,'Yüksek IV → ideal prim ortamı'); add('short_put',p,'Yüksek IV → yüksek prim')
    pen('long_call',p,'Yüksek IV → pahalı, IV crush riski'); pen('long_put',p-1,'Yüksek IV → pahalı')
    pen('bull_call_spread',2,'Yüksek IV → debit spread pahalı'); pen('bear_put_spread',2,'Yüksek IV → debit spread pahalı')
  }

  // Stock Trend
  if (s.stock_trend === 'strong_up') {
    add('long_call',3,'Güçlü yükseliş'); add('bull_call_spread',3,'Güçlü yükseliş'); add('bull_put_spread',2,'Yükseliş destekliyor')
    pen('long_put',3,'Yükselişe karşı'); pen('bear_call_spread',3,'Yükselişe karşı'); pen('bear_put_spread',3,'Yükselişe karşı'); pen('iron_condor',2,'Güçlü trend → kırılma riski')
  } else if (s.stock_trend === 'mild_up') {
    add('long_call',2,'Hafif yükseliş'); add('bull_call_spread',2,'Hafif yükseliş'); add('bull_put_spread',3,'Hafif yükseliş → ideal')
    add('short_put',2,'Hafif yükseliş destekliyor')
    pen('long_put',2,'Yükseliş aleyhine'); pen('bear_call_spread',1,'Hafif yükseliş aleyhine')
  } else if (s.stock_trend === 'sideways') {
    add('iron_condor',4,'Yatay → iron condor ideal'); add('bull_put_spread',2,'Yatay → uygun'); add('bear_call_spread',2,'Yatay → uygun')
    add('short_put',2,'Yatay → prim toplama uygun')
    pen('long_call',2,'Yatay → yön zayıf'); pen('long_put',2,'Yatay → yön zayıf')
  } else if (s.stock_trend === 'mild_down') {
    add('long_put',2,'Hafif düşüş'); add('bear_put_spread',2,'Hafif düşüş'); add('bear_call_spread',3,'Hafif düşüş → ideal')
    pen('long_call',2,'Düşüş aleyhine'); pen('bull_put_spread',1,'Hafif düşüş riski'); pen('short_put',2,'Düşüşte put satmak tehlikeli')
  } else if (s.stock_trend === 'strong_down') {
    add('long_put',3,'Güçlü düşüş'); add('bear_put_spread',3,'Güçlü düşüş'); add('bear_call_spread',2,'Düşüş destekliyor')
    pen('long_call',3,'Düşüşe karşı'); pen('bull_put_spread',3,'Düşüşte put satmak riskli'); pen('bull_call_spread',3,'Düşüşe karşı')
    pen('iron_condor',2,'Güçlü trend → kırılma riski'); pen('short_put',3,'Sert düşüşte assignment tehlikesi')
  }

  // Market Trend
  if (s.market_trend === 'strong_bull') {
    add('long_call',2,'Piyasa güçlü boğa'); add('bull_call_spread',2,'Piyasa desteği'); add('bull_put_spread',1,'Piyasa lehine')
    pen('long_put',2,'Piyasaya karşı'); pen('bear_call_spread',2,'Piyasaya karşı')
  } else if (s.market_trend === 'mild_bull') {
    add('long_call',1,'Piyasa hafif pozitif'); add('bull_put_spread',1,'Piyasa desteği'); add('bull_call_spread',1,'Piyasa hafif pozitif')
  } else if (s.market_trend === 'neutral') {
    add('iron_condor',2,'Nötr piyasa → yatay güçlü')
  } else if (s.market_trend === 'mild_bear') {
    add('long_put',1,'Piyasa hafif negatif'); add('bear_call_spread',1,'Piyasa desteği'); add('bear_put_spread',1,'Piyasa hafif negatif')
    pen('long_call',1,'Piyasa aleyhine')
  } else if (s.market_trend === 'strong_bear') {
    add('long_put',2,'Piyasa güçlü ayı'); add('bear_put_spread',2,'Piyasa desteği'); add('bear_call_spread',1,'Piyasa lehine')
    pen('long_call',2,'Piyasaya karşı'); pen('bull_put_spread',2,'Ayı piyasasında riskli'); pen('iron_condor',1,'Volatilite riski')
  }

  // VIX
  if (s.vix_level === 'low') {
    add('long_call',1,'Düşük VIX → ucuz'); add('long_put',1,'Düşük VIX → ucuz'); add('iron_condor',1,'Düşük VIX → sakin')
    pen('bull_put_spread',1,'Düşük VIX → primler düşük'); pen('bear_call_spread',1,'Düşük VIX → primler düşük')
  } else if (s.vix_level === 'high' || s.vix_level === 'extreme') {
    add('bull_put_spread',2,'Yüksek VIX → yüksek primler'); add('bear_call_spread',2,'Yüksek VIX → yüksek primler')
    pen('iron_condor', s.vix_level === 'extreme' ? 3 : 1, s.vix_level === 'extreme' ? 'Aşırı VIX → çok riskli' : 'Yüksek VIX → dikkat')
    pen('long_call',1,'Yüksek VIX → pahalı')
  }

  // Support/Resistance
  if (s.support_resistance === 'very_clear' || s.support_resistance === 'clear') {
    add('iron_condor',3,'Net seviyeler → güvenli kanat'); add('bull_put_spread',2,'Net destek → güvenli strike'); add('bear_call_spread',2,'Net direnç → güvenli strike')
  } else if (s.support_resistance === 'unclear') {
    pen('iron_condor',3,'Belirsiz seviyeler → riskli'); pen('bull_put_spread',2,'Belirsiz destek'); pen('bear_call_spread',2,'Belirsiz direnç')
    add('long_call',1,"Yönsel trade'de seviye az kritik"); add('long_put',1,"Yönsel trade'de seviye az kritik")
  }

  // Earnings
  if (s.earnings === 'danger') {
    pen('iron_condor',4,'⚠️ Earnings çok yakın'); pen('bull_put_spread',3,'⚠️ Earnings gap riski'); pen('bear_call_spread',3,'⚠️ Earnings gap riski')
    pen('short_put',3,'⚠️ Assignment riski'); pen('long_call',2,'⚠️ IV crush riski'); pen('long_put',2,'⚠️ IV crush riski')
  } else if (s.earnings === 'caution') {
    pen('iron_condor',2,'Earnings yaklaşıyor'); pen('bull_put_spread',1,'Earnings yaklaşıyor')
    pen('bear_call_spread',1,'Earnings yaklaşıyor'); pen('short_put',1,'Earnings yaklaşıyor')
  }

  // Price Level
  if (s.price_at_level === 'at_support') {
    add('bull_put_spread',3,'Destek → put spread ideal'); add('long_call',2,'Destek bounce'); add('bull_call_spread',2,'Destek bounce')
    add('short_put',3,'Destek → güvenli put satışı'); pen('long_put',1,'Destek → aşağı zor')
  } else if (s.price_at_level === 'at_resistance') {
    add('bear_call_spread',3,'Direnç → call spread ideal'); add('long_put',2,'Direnç red'); add('bear_put_spread',2,'Direnç red')
    pen('long_call',1,'Direnç → yukarı zor')
  } else if (s.price_at_level === 'mid_range') {
    add('iron_condor',2,'Range ortası → iki tarafa mesafe')
  } else if (s.price_at_level === 'breakout_up') {
    add('long_call',3,'Kırılım → momentum'); add('bull_call_spread',3,'Kırılım → yukarı devam')
    pen('bear_call_spread',2,'Yukarı kırılıma karşı'); pen('iron_condor',2,'Kırılım → yatay uyumsuz')
  } else if (s.price_at_level === 'breakdown') {
    add('long_put',3,'Kırılım → momentum'); add('bear_put_spread',3,'Kırılım → aşağı devam')
    pen('bull_put_spread',2,'Aşağı kırılıma karşı'); pen('iron_condor',2,'Kırılım → yatay uyumsuz'); pen('short_put',2,'Kırılımda put satmak tehlikeli')
  }

  // Capital
  const cap = getCapitalMetrics(stockPrice)
  if (cap) {
    if (cap.putCollateralPct > 80) sc['short_put'].warnings.push(`ℹ️ Teminat $${cap.putCollateral} (hesabın %${Math.round(cap.putCollateralPct)}'i) — assign olursan hesabın tamamını bağlar`)
    else if (cap.putCollateralPct > 50) sc['short_put'].warnings.push(`ℹ️ Teminat $${cap.putCollateral} (hesabın %${Math.round(cap.putCollateralPct)}'i) — assign olursa hesabın yarısından fazlası bağlanır`)
    else if (cap.putCollateralPct > 30) sc['short_put'].warnings.push(`ℹ️ Teminat $${cap.putCollateral} (hesabın %${Math.round(cap.putCollateralPct)}'i) — assign olursa önemli bir kısım bağlanır`)
    else add('short_put',1,`💰 Teminat $${cap.putCollateral} (hesabın %${Math.round(cap.putCollateralPct)}'i) — sermaye açısından rahat`)

    if (cap.putCollateralPct <= 60) add('short_put',1,`🔄 Wheel uyumlu — assign olursa hisseyi alıp covered call satabilirsin`)
    else if (cap.putCollateralPct <= 100) sc['short_put'].reasons.push(`🔄 Wheel mümkün ama assign olursa hesap tamamen bağlanır`)
    else sc['short_put'].warnings.push(`🔄 Wheel uyumsuz — hisse fiyatı hesap için çok yüksek`)

    if (cap.longCostPct > 20) { pen('long_call',2,`💰 Tahmini maliyet ~$${Math.round(cap.longCost)} → hesabın %${Math.round(cap.longCostPct)}'i, pahalı`); pen('long_put',2,`💰 Tahmini maliyet ~$${Math.round(cap.longCost)} → hesabın %${Math.round(cap.longCostPct)}'i, pahalı`) }
    else if (cap.longCostPct > 10) { pen('long_call',1,`💰 Tahmini maliyet ~$${Math.round(cap.longCost)} → hesabın %${Math.round(cap.longCostPct)}'i`); pen('long_put',1,`💰 Tahmini maliyet ~$${Math.round(cap.longCost)} → hesabın %${Math.round(cap.longCostPct)}'i`) }
    else { add('long_call',1,`💰 Tahmini maliyet ~$${Math.round(cap.longCost)} → hesaba uygun`); add('long_put',1,`💰 Tahmini maliyet ~$${Math.round(cap.longCost)} → hesaba uygun`) }

    if (cap.spread5Pct > 20) {
      pen('bull_put_spread',1,`💰 $5 spread max loss $500 → hesabın %${Math.round(cap.spread5Pct)}'i`)
      pen('bear_call_spread',1,`💰 $5 spread max loss $500 → hesabın %${Math.round(cap.spread5Pct)}'i`)
      pen('iron_condor',1,`💰 $5 kanat → max loss yüksek, dar kanat tercih et`)
    }

    if (cap.price > 200) {
      pen('long_call',2,`💰 $${cap.price} hisse → opsiyon maliyeti çok yüksek`); pen('long_put',2,`💰 $${cap.price} hisse → opsiyon maliyeti çok yüksek`)
      pen('bull_call_spread',1,`💰 $${cap.price} hisse → geniş strike aralıkları`); pen('bear_put_spread',1,`💰 $${cap.price} hisse → geniş strike aralıkları`)
      pen('iron_condor',1,`💰 $${cap.price} hisse → teminat yüksek`)
    } else if (cap.price >= 20 && cap.price <= 80) {
      add('bull_put_spread',1,`💰 $${cap.price} hisse → $3K hesaba ideal fiyat aralığı`)
      add('bear_call_spread',1,`💰 $${cap.price} hisse → $3K hesaba ideal fiyat aralığı`)
      add('iron_condor',1,`💰 $${cap.price} hisse → $3K hesaba ideal fiyat aralığı`)
    }
  }

  return sc
}

function applyTimeModifiers(base: ScoreMap, tf: string, s: Record<string, string>): ScoreMap {
  const sc: ScoreMap = {}
  Object.keys(base).forEach(k => { sc[k] = { score: base[k].score, reasons: [...base[k].reasons], warnings: [...base[k].warnings] } })
  const add = (k: string, p: number, r: string) => { sc[k].score += p; sc[k].reasons.push('⏱ ' + r) }
  const pen = (k: string, p: number, r: string) => { sc[k].score -= p; sc[k].warnings.push('⏱ ' + r) }

  if (tf === 'short') {
    add('bull_put_spread',1,'Kısa vade → theta hızlı'); add('bear_call_spread',1,'Kısa vade → theta hızlı'); add('iron_condor',1,'Kısa vade → theta hızlı')
    pen('long_call',3,'Kısa vade → theta çok hızlı eritir'); pen('long_put',3,'Kısa vade → theta çok hızlı eritir')
    pen('bull_call_spread',2,'Kısa vade → hareket zamanı yok'); pen('bear_put_spread',2,'Kısa vade → hareket zamanı yok')
    if (s.vix_level === 'extreme') {
      pen('bull_put_spread',3,'Kısa vade + VIX 35+ → gamma riski çok yüksek'); pen('bear_call_spread',3,'Kısa vade + VIX 35+ → gamma riski çok yüksek')
      pen('iron_condor',4,'Kısa vade + VIX 35+ → tek gün max loss olabilir'); pen('long_call',2,'Kısa vade + VIX 35+ → çok pahalı'); pen('long_put',1,'Kısa vade + VIX 35+ → pahalı')
    } else if (s.vix_level === 'high') {
      pen('bull_put_spread',1,'Kısa vade + yüksek VIX → gamma riski'); pen('bear_call_spread',1,'Kısa vade + yüksek VIX → gamma riski'); pen('iron_condor',2,'Kısa vade + yüksek VIX → tehlikeli')
    }
    pen('short_put',2,'Kısa vade → prim düşük, risk/ödül kötü')
    if (s.earnings === 'caution') {
      pen('bull_put_spread',2,'Kısa vade + earnings yakın → vade denk gelebilir'); pen('bear_call_spread',2,'Kısa vade + earnings yakın → vade denk gelebilir'); pen('iron_condor',2,'Kısa vade + earnings → çok riskli')
    }
  }
  if (tf === 'mid') {
    add('bull_put_spread',2,'Orta vade → credit spread için ideal theta'); add('bear_call_spread',2,'Orta vade → credit spread için ideal theta')
    add('iron_condor',2,'Orta vade → iron condor için ideal'); add('short_put',1,'Orta vade → makul prim/risk dengesi')
    pen('long_call',1,'Orta vade → theta etkisi artıyor'); pen('long_put',1,'Orta vade → theta etkisi artıyor')
    if (s.earnings === 'caution') {
      pen('bull_put_spread',1,'Orta vade → earnings denk gelebilir'); pen('bear_call_spread',1,'Orta vade → earnings denk gelebilir'); pen('iron_condor',2,'Orta vade + earnings → tehlikeli')
    }
  }
  if (tf === 'long') {
    add('long_call',3,'Uzun vade → theta yavaş, harekete zaman var'); add('long_put',3,'Uzun vade → theta yavaş, harekete zaman var')
    add('bull_call_spread',2,'Uzun vade → debit spread için uygun'); add('bear_put_spread',2,'Uzun vade → debit spread için uygun')
    pen('bull_put_spread',1,'Uzun vade → theta yavaş, sermaye uzun bağlı'); pen('bear_call_spread',1,'Uzun vade → theta yavaş, sermaye uzun bağlı')
    pen('iron_condor',1,'Uzun vade → sermaye bağlı, hareket riski artar')
    if (s.earnings === 'caution' || s.earnings === 'danger') {
      pen('bull_put_spread',2,'Uzun vade → earnings kesin vadenin içinde'); pen('bear_call_spread',2,'Uzun vade → earnings kesin vadenin içinde')
      pen('iron_condor',3,'Uzun vade + earnings → çok tehlikeli'); pen('short_put',2,'Uzun vade → earnings vadenin içinde')
    }
  }
  return sc
}

function calculateMaxScores(): Record<string, number> {
  const criteriaOptions: Record<string, string[]> = {
    iv_rank: ['low','medium','high','very_high'],
    stock_trend: ['strong_up','mild_up','sideways','mild_down','strong_down'],
    market_trend: ['strong_bull','mild_bull','neutral','mild_bear','strong_bear'],
    vix_level: ['low','medium','high','extreme'],
    support_resistance: ['very_clear','clear','moderate','unclear'],
    earnings: ['clear','caution','danger'],
    price_at_level: ['at_support','mid_range','at_resistance','breakout_up','breakdown'],
  }
  const maxes: Record<string, number> = {}
  Object.keys(STRATEGIES).forEach(k => { maxes[k] = 0 })
  const keys = Object.keys(criteriaOptions)
  function simulate(idx: number, sel: Record<string, string>) {
    if (idx === keys.length) {
      const scores = getBaseScores(sel, 30)
      Object.keys(scores).forEach(k => { if (scores[k].score > maxes[k]) maxes[k] = scores[k].score })
      return
    }
    criteriaOptions[keys[idx]].forEach(opt => { sel[keys[idx]] = opt; simulate(idx + 1, sel) })
  }
  simulate(0, {})
  return maxes
}

function applyTimeModifiersMax(maxScores: Record<string, number>, tf: string): Record<string, number> {
  const r = { ...maxScores }
  if (tf === 'short') { r['bull_put_spread'] += 1; r['bear_call_spread'] += 1; r['iron_condor'] += 1 }
  if (tf === 'mid') { r['bull_put_spread'] += 2; r['bear_call_spread'] += 2; r['iron_condor'] += 2; r['short_put'] += 1 }
  if (tf === 'long') { r['long_call'] += 3; r['long_put'] += 3; r['bull_call_spread'] += 2; r['bear_put_spread'] += 2 }
  return r
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function OpsPage() {
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [stockPrice, setStockPrice] = useState(0)
  const [activeTab, setActiveTab] = useState('mid')
  const [openCards, setOpenCards] = useState<Set<string>>(new Set())

  const filledCount = Object.keys(selections).length + (stockPrice > 0 ? 1 : 0)
  const totalCount = CRITERIA.length + 1
  const progressPct = (filledCount / totalCount) * 100
  const allFilled = Object.keys(selections).length === CRITERIA.length && stockPrice > 0

  const maxScores = useMemo(() => calculateMaxScores(), [])

  const allResults = useMemo(() => {
    if (Object.keys(selections).length < 3) return null
    const base = getBaseScores(selections, stockPrice)
    const results: Record<string, any[]> = {}
    TIMEFRAMES.forEach(tf => {
      const mod = applyTimeModifiers(base, tf.id, selections)
      const maxMod = applyTimeModifiersMax(maxScores, tf.id)
      const arr = Object.entries(mod).map(([k, d]) => {
        const dynMax = Math.max(maxMod[k], 1)
        const pct = Math.max(0, Math.min(100, Math.round((d.score / dynMax) * 100)))
        return { key: k, ...STRATEGIES[k], ...d, pct }
      })
      arr.sort((a, b) => b.pct - a.pct)
      results[tf.id] = arr
    })
    return results
  }, [selections, stockPrice, maxScores])

  const cap = useMemo(() => getCapitalMetrics(stockPrice), [stockPrice])

  const toggle = (key: string) => {
    setOpenCards(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  const select = (cid: string, val: string) => {
    setSelections(prev => {
      const n = { ...prev }
      if (n[cid] === val) delete n[cid]; else n[cid] = val
      return n
    })
  }

  const reset = () => { setSelections({}); setStockPrice(0) }

  const pctColor = (pct: number) => pct >= 55 ? 'var(--green)' : pct >= 35 ? 'var(--amber)' : 'var(--red)'
  const cls = (pct: number) => pct >= 55 ? 'good' : pct >= 35 ? 'mid' : 'bad'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-2)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ height: 48, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)', marginRight: 14 }}>HAKARI</span>
          <Link href="/dashboard" style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'DM Mono, monospace', padding: '4px 12px', borderLeft: '1px solid var(--border)', textDecoration: 'none', letterSpacing: '0.06em' }}>ANALİZ</Link>
          <Link href="/mkt" style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'DM Mono, monospace', padding: '4px 12px', borderLeft: '1px solid var(--border)', textDecoration: 'none', letterSpacing: '0.06em' }}>MKT</Link>
          <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: 'DM Mono, monospace', padding: '4px 12px', borderLeft: '1px solid var(--border)', letterSpacing: '0.06em', borderBottom: '2px solid var(--text)' }}>OPS</span>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 28, maxWidth: 800 }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--amber)', marginBottom: 4, letterSpacing: '-0.02em' }}>OPSİYON STRATEJİ SKORU</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8 }}>v2.4 — dinamik skorlama</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Koşulları gir → her zaman dilimi için stratejiler sıralansın</div>
          {/* Progress */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <div style={{ width: 120, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: allFilled ? 'var(--green)' : 'var(--amber)', borderRadius: 2, transition: 'all 0.3s' }} />
            </div>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{filledCount}/{totalCount}</span>
          </div>
        </div>

        {/* Criteria */}
        {['market', 'stock'].map(cat => (
          <div key={cat} style={{ marginBottom: 24 }}>
            <div className="section-title" style={{ marginBottom: 16 }}>{cat === 'market' ? '📊  Piyasa Koşulları' : '🔍  Hisse Koşulları'}</div>
            {CRITERIA.filter(c => c.category === cat).map(cr => (
              <div key={cr.id} style={{ marginBottom: 16 }}>
                <div className="mono" style={{ fontSize: 11, color: selections[cr.id] ? 'var(--text)' : 'var(--text-3)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {cr.label}
                  {selections[cr.id] && <span style={{ color: 'var(--green)', fontSize: 10 }}>✓</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {cr.options.map(o => (
                    <button
                      key={o.value}
                      onClick={() => select(cr.id, o.value)}
                      style={{
                        padding: '7px 13px', borderRadius: 6, fontSize: 12, fontFamily: 'DM Mono, monospace', cursor: 'pointer', transition: 'all 0.15s',
                        background: selections[cr.id] === o.value ? 'rgba(251,191,36,0.1)' : 'var(--bg-3)',
                        border: selections[cr.id] === o.value ? '1.5px solid var(--amber)' : '1px solid var(--border)',
                        color: selections[cr.id] === o.value ? 'var(--amber)' : 'var(--text-3)',
                        fontWeight: selections[cr.id] === o.value ? 600 : 400,
                      }}
                    >{o.label}</button>
                  ))}
                </div>
              </div>
            ))}

            {cat === 'stock' && (
              <div style={{ marginBottom: 16 }}>
                <div className="mono" style={{ fontSize: 11, color: stockPrice > 0 ? 'var(--text)' : 'var(--text-3)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Hisse Fiyatı ($)
                  {stockPrice > 0 && <span style={{ color: 'var(--green)', fontSize: 10 }}>✓</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input
                    type="number" min="1" step="0.01" placeholder="ör: 15.35"
                    value={stockPrice || ''}
                    onChange={e => setStockPrice(parseFloat(e.target.value) || 0)}
                    style={{ width: 110, padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--amber)', fontFamily: 'DM Mono, monospace', fontSize: 14, outline: 'none' }}
                  />
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>opsiyon maliyet ve teminat hesabı için</span>
                </div>
                {cap && (
                  <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: 'var(--bg-3)', border: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    {[
                      { label: 'Short Put teminat', val: `$${cap.putCollateral} (%${Math.round(cap.putCollateralPct)})`, warn: cap.putCollateralPct > 50 },
                      { label: 'ATM opsiyon ~', val: `$${Math.round(cap.longCost)} (%${Math.round(cap.longCostPct)})`, warn: cap.longCostPct > 15 },
                      { label: '$2 spread max loss', val: `$200 (%${Math.round(cap.spread2Pct)})`, warn: false },
                    ].map((x, i) => (
                      <div key={i} className="mono" style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 4 }}>
                        {x.label}: <span style={{ color: x.warn ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>{x.val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Reset */}
        {(Object.keys(selections).length > 0 || stockPrice > 0) && (
          <div style={{ textAlign: 'center', margin: '16px 0' }}>
            <button onClick={reset} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-3)', padding: '5px 16px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'DM Mono, monospace' }}>Sıfırla</button>
          </div>
        )}

        {/* Results */}
        {!allResults ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }} className="mono">En az 3 kriter seç → sonuçlar görünsün</div>
        ) : (
          <div>
            <div className="section-title" style={{ marginBottom: 12 }}>
              🎯 Strateji Uygunluk Sıralaması
              {!allFilled && <span className="mono" style={{ color: 'var(--amber)', fontSize: 10, marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>(tüm kriterleri doldurursan sonuç netleşir)</span>}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              {TIMEFRAMES.map(tf => {
                const best = allResults[tf.id][0]
                return (
                  <button key={tf.id} onClick={() => setActiveTab(tf.id)} style={{ flex: 1, padding: '10px 8px', textAlign: 'center', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 11, background: 'none', border: 'none', borderBottom: activeTab === tf.id ? `2px solid var(--amber)` : '2px solid transparent', color: activeTab === tf.id ? 'var(--amber)' : 'var(--text-3)', transition: 'all 0.15s' }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>{tf.label}</span>
                    <span style={{ display: 'block', fontSize: 9, opacity: 0.7 }}>{tf.sub}</span>
                    <span style={{ display: 'block', fontSize: 10, marginTop: 4, color: pctColor(best.pct) }}>En iyi: %{best.pct}</span>
                  </button>
                )
              })}
            </div>

            {/* Warnings */}
            {activeTab === 'short' && selections.vix_level === 'extreme' && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--red)' }}>
                <strong>⚠️ Kısa Vade + VIX 35+:</strong> Gamma riski çok yüksek. Tek bir sert hareket pozisyonu max loss'a taşıyabilir.
              </div>
            )}
            {activeTab === 'short' && (selections.earnings === 'caution' || selections.earnings === 'danger') && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--red)' }}>
                <strong>⚠️ Kısa Vade + Earnings:</strong> Opsiyon vadesi earnings'e denk gelebilir. Takvimi kontrol et.
              </div>
            )}
            {activeTab === 'long' && (selections.earnings === 'caution' || selections.earnings === 'danger') && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--red)' }}>
                <strong>⚠️ Uzun Vade + Earnings:</strong> 30-60 günlük vade neredeyse kesinlikle earnings'i içerir.
              </div>
            )}

            {/* Cards */}
            {(() => {
              const results = allResults[activeTab]
              const top = results.filter(r => r.pct >= 55)
              const mid = results.filter(r => r.pct >= 35 && r.pct < 55)
              const low = results.filter(r => r.pct < 35)
              let rank = 1
              return (
                <>
                  {top.length === 0 && mid.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 20, marginBottom: 16, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8 }}>
                      <div className="mono" style={{ fontSize: 13, color: 'var(--red)', marginBottom: 4 }}>Bu zaman diliminde uygun strateji yok</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Diğer zaman dilimlerini kontrol et veya piyasa koşullarının değişmesini bekle</div>
                    </div>
                  )}
                  {top.length > 0 && <div style={{ marginBottom: 16 }}>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--green)', marginBottom: 8, letterSpacing: 1 }}>▲ UYGUN STRATEJİLER</div>
                    {top.map(r => <StrategyCard key={r.key} r={r} rank={rank++} allResults={allResults} activeTab={activeTab} open={openCards.has(r.key+activeTab)} onToggle={() => toggle(r.key+activeTab)} />)}
                  </div>}
                  {mid.length > 0 && <div style={{ marginBottom: 16 }}>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--amber)', marginBottom: 8, letterSpacing: 1 }}>● KOŞULLU UYGUN</div>
                    {mid.map(r => <StrategyCard key={r.key} r={r} rank={rank++} allResults={allResults} activeTab={activeTab} open={openCards.has(r.key+activeTab)} onToggle={() => toggle(r.key+activeTab)} />)}
                  </div>}
                  {low.length > 0 && <div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--red)', marginBottom: 8, letterSpacing: 1 }}>▼ UYGUN DEĞİL</div>
                    {low.map(r => <StrategyCard key={r.key} r={r} rank={rank++} allResults={allResults} activeTab={activeTab} open={openCards.has(r.key+activeTab)} onToggle={() => toggle(r.key+activeTab)} />)}
                  </div>}
                </>
              )
            })()}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--border)' }} className="mono">
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Hesap: $3,000 · Opsiyon Strateji Değerlendirme Aracı</div>
          <div style={{ fontSize: 10, color: 'var(--border-3)', marginTop: 4 }}>Yatırım tavsiyesi değildir. Kendi araştırmanızı yapınız.</div>
        </div>
      </div>
    </div>
  )
}

function StrategyCard({ r, rank, allResults, activeTab, open, onToggle }: any) {
  const pct = r.pct
  const color = pct >= 55 ? (r.type === 'credit' ? 'var(--green)' : 'var(--blue)') : pct >= 35 ? 'var(--amber)' : 'var(--red)'
  const pctColor = pct >= 55 ? 'var(--green)' : pct >= 35 ? 'var(--amber)' : 'var(--red)'
  const borderColor = pct >= 55 ? 'rgba(74,222,128,0.25)' : pct >= 35 ? 'rgba(251,191,36,0.2)' : 'rgba(239,68,68,0.12)'

  return (
    <div onClick={onToggle} style={{ background: 'var(--bg-2)', border: `1px solid ${borderColor}`, borderRadius: 10, padding: '14px 16px', marginBottom: 8, cursor: 'pointer', transition: 'all 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)', width: 20 }}>#{rank}</span>
        <span style={{ fontSize: 18 }}>{r.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{r.name}</span>
            <span className="mono" style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, color: pctColor, border: `1px solid ${borderColor}` }}>
              {pct >= 55 ? 'UYGUN' : pct >= 35 ? 'KOŞULLU' : 'UYGUN DEĞİL'}
            </span>
            <span className="mono" style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, color: r.type === 'credit' ? 'var(--green)' : 'var(--blue)', background: r.type === 'credit' ? 'rgba(74,222,128,0.1)' : 'rgba(96,165,250,0.1)' }}>
              {r.type}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.5s' }} />
            </div>
            <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: pctColor, minWidth: 38, textAlign: 'right' }}>%{pct}</span>
          </div>
          {/* Time compare */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            {TIMEFRAMES.map(tf => {
              const found = allResults[tf.id].find((x: any) => x.key === r.key)
              const sc = found ? found.pct : 0
              const c = sc >= 55 ? 'var(--green)' : sc >= 35 ? 'var(--amber)' : 'var(--red)'
              return (
                <div key={tf.id} style={{ flex: 1, textAlign: 'center', padding: '4px 6px', borderRadius: 4, background: 'var(--bg-3)', border: `1px solid ${tf.id === activeTab ? c : 'var(--border)'}` }}>
                  <span className="mono" style={{ display: 'block', fontSize: 9, color: 'var(--text-3)', marginBottom: 2 }}>{tf.label}</span>
                  <span className="mono" style={{ fontWeight: 600, fontSize: 11, color: c }}>%{sc}</span>
                </div>
              )
            })}
          </div>
        </div>
        <span style={{ color: 'var(--text-3)', fontSize: 12, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </div>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {r.reasons.map((x: string, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--green)', padding: '2px 0' }}>✓ {x}</div>)}
          {r.warnings.map((x: string, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--red)', padding: '2px 0' }}>✗ {x}</div>)}
          {!r.reasons.length && !r.warnings.length && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Belirgin sinyal yok</div>}
        </div>
      )}
    </div>
  )
}
