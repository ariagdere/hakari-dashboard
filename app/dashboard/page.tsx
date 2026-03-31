'use client'
import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip)

const AnalysisModal = dynamic(() => import('@/components/AnalysisModal'), { ssr: false })

interface AnalysisSummary {
  id: number
  analyzed_at: string
  direction: string
  entry: number
  tp: number
  sl: number
  rr: string
  market_score_value: number
  confidence_value: number
  sim_result: string
  sim_pnl_usd: number
  sim_r_multiple: number
}

interface Stats {
  total: number
  tp_count: number
  sl_count: number
  expired_co
