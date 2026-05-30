'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { Chart } from '@/types'

// Tam rəqəm — M/K yoxdur
function fmtFull(v: number) {
  return v.toLocaleString('az-AZ', { maximumFractionDigits: 0 })
}

// Y oxu üçün qısa format (məsələn 24,800,000 → 24.8M) yalnız etiket üçün
function fmtAxis(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number }>; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-100 rounded-lg shadow-lg px-3 py-2">
      <p className="text-xs font-medium text-slate-600 mb-1">{label}</p>
      <p className="text-sm font-bold text-brand-700">
        {fmtFull(payload[0].value)} ₼
      </p>
    </div>
  )
}

interface ChatChartProps {
  chart: Chart
  height?: number
}

export default function ChatChart({ chart, height = 200 }: ChatChartProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted) {
    return <div className="mt-3 animate-pulse rounded-xl bg-slate-100" style={{ height }} />
  }

  const xKey = chart.xKey || (chart.data[0] ? Object.keys(chart.data[0])[0] : 'x')
  const yKey = chart.yKey || (chart.data[0] ? Object.keys(chart.data[0])[1] : 'value')

  return (
    <div className="mt-3 bg-slate-50 rounded-xl p-4">
      {chart.title && (
        <p className="text-xs font-medium text-slate-500 mb-3">{chart.title}</p>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chart.data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barSize={28}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={fmtAxis}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />
          <Bar dataKey={yKey} fill="#16a34a" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
