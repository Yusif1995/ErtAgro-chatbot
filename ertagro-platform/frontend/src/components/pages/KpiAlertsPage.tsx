'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, TrendingDown,
  DollarSign, Package, BarChart2, Tag, CreditCard,
  Loader2, Send, X, CheckCircle, Mail, CalendarDays,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList,
} from 'recharts'
import type { Filter } from '@/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

interface KpiItem {
  id: string
  label: string
  value: number
  unit: string
  change: number
  trend: string
  threshold: number
  alert: boolean
  period: string
  margin?: number
}

interface TrendPoint {
  month: number
  monthName: string
  sales: number
  volume: number
  profit: number
}

const ICON_MAP: Record<string, React.ElementType> = {
  total_sales: DollarSign,
  total_volume: Package,
  profit: TrendingUp,
  avg_price: Tag,
  cashback: CreditCard,
}

function formatValue(value: number): string {
  return Math.round(value).toLocaleString('az-AZ')
}

// Email modal
function EmailModal({
  kpi,
  filters,
  onClose,
}: {
  kpi: KpiItem
  filters: Filter
  onClose: () => void
}) {
  const [toEmail, setToEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')

  const filtersInfo = [
    filters.sobe && `Şöbə: ${filters.sobe}`,
    filters.category && `Kateqoriya: ${filters.category}`,
    filters.maliTipi && `Malın Tipi: ${filters.maliTipi}`,
    filters.xususiyyetQrupu && `Xüsusiyyət: ${filters.xususiyyetQrupu}`,
    filters.dateFrom && `Başlanğıc: ${filters.dateFrom}`,
    filters.dateTo && `Son: ${filters.dateTo}`,
  ].filter(Boolean).join(' | ')

  const handleSend = async () => {
    if (!toEmail.trim()) { setErr('Email ünvanı daxil edin'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) { setErr('Düzgün email ünvanı daxil edin'); return }
    setSending(true)
    setErr('')
    try {
      const res = await fetch(`${API_BASE}/api/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_email: toEmail.trim(),
          kpi_label: kpi.label,
          kpi_value: formatValue(kpi.value),
          kpi_unit: kpi.unit,
          kpi_change: kpi.change,
          kpi_trend: kpi.trend,
          kpi_alert: kpi.alert,
          filters_info: filtersInfo,
          extra_message: message.trim(),
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.detail || 'Xəta baş verdi')
      }
      setSent(true)
      setTimeout(onClose, 2000)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Göndərmə xətası')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-w-[95vw] p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
              <Mail size={15} className="text-brand-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">KPI Paylaş</h3>
              <p className="text-xs text-slate-400">{kpi.label}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50">
            <X size={14} className="text-slate-400" />
          </button>
        </div>

        <div className="bg-brand-50 border border-brand-100 rounded-xl p-3 mb-4">
          <p className="text-xs text-slate-500 mb-1">{kpi.label}</p>
          <p className="text-xl font-bold text-slate-800">
            {formatValue(kpi.value)}
            <span className="text-sm font-medium text-slate-400 ml-1">{kpi.unit}</span>
          </p>
          <p className={`text-xs font-semibold mt-1 ${kpi.trend === 'up' ? 'text-brand-600' : 'text-red-500'}`}>
            {kpi.change > 0 ? '+' : ''}{kpi.change}% {kpi.trend === 'up' ? '↑' : '↓'}
          </p>
          {filtersInfo && (
            <p className="text-xs text-slate-400 mt-1">Filtrlər: {filtersInfo}</p>
          )}
        </div>

        {sent ? (
          <div className="flex flex-col items-center py-4 gap-2">
            <CheckCircle size={32} className="text-brand-500" />
            <p className="text-sm font-semibold text-brand-700">Email göndərildi!</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Alıcının email ünvanı *</label>
              <input
                type="email"
                value={toEmail}
                onChange={e => setToEmail(e.target.value)}
                placeholder="ad@şirkət.com"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Əlavə mesaj (istəyə bağlı)</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Bu KPI barədə qeydlərinizi yazın..."
                rows={3}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-100 resize-none"
              />
            </div>
            {err && <p className="text-xs text-red-500">{err}</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Ləğv et
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
                {sending ? 'Göndərilir...' : 'Göndər'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// KPI card
function KpiCard({
  kpi,
  onShare,
}: {
  kpi: KpiItem
  onShare: (kpi: KpiItem) => void
}) {
  const Icon = ICON_MAP[kpi.id] || BarChart2
  const isUp = kpi.trend === 'up'
  const isProfit = kpi.id === 'profit'

  return (
    <div className="rounded-2xl p-5 shadow-card border bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-50 dark:bg-brand-900/30">
            <Icon size={18} className="text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</p>
            <span className="text-xs text-slate-400 dark:text-slate-500">{kpi.period}</span>
          </div>
        </div>
        {isProfit ? (
          <div className="px-2 py-1 rounded-full text-xs font-semibold bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400">
            {kpi.margin != null ? `${kpi.margin.toFixed(1)}% marja` : '—'}
          </div>
        ) : (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
            isUp
              ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400'
              : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
          }`}>
            {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {kpi.change > 0 ? '+' : ''}{kpi.change}%
          </div>
        )}
      </div>

      <div className="mb-4">
        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          {formatValue(kpi.value)}
          <span className="text-sm font-medium text-slate-400 dark:text-slate-500 ml-1">{kpi.unit}</span>
        </p>
      </div>

      <button
        onClick={() => onShare(kpi)}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 hover:text-brand-700 dark:hover:text-brand-400 hover:border-brand-200 dark:hover:border-brand-700 transition-all"
      >
        <Mail size={11} />
        Email ilə paylaş
      </button>
    </div>
  )
}

// Trend chart configs
const TREND_CONFIGS = [
  { key: 'sales',  label: 'Satış',          unit: '₼',  color: '#6366f1' },
  { key: 'volume', label: 'Satış Miqdarı',  unit: 'kq', color: '#10b981' },
  { key: 'profit', label: 'Gəlir',          unit: '₼',  color: '#8b5cf6' },
] as const

function TrendCharts({ filters }: { filters: Filter }) {
  const [data, setData] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.sobe)             params.set('sobe', filters.sobe)
    if (filters.category)         params.set('category', filters.category)
    if (filters.maliTipi)         params.set('mali_tipi', filters.maliTipi)
    if (filters.xususiyyetQrupu)  params.set('xususiyyet_qrupu', filters.xususiyyetQrupu)

    fetch(`${API_BASE}/api/kpi-trend?${params}`)
      .then(r => r.json())
      .then(d => setData(Array.isArray(d) ? d : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [filters])

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={20} className="text-brand-600 animate-spin" />
      </div>
    )
  }
  if (data.length === 0) return null

  const fmt = (v: unknown) => Math.round(Number(v)).toLocaleString('az-AZ')

  return (
    <div className="space-y-4 mt-4">
      {TREND_CONFIGS.map(cfg => (
        <div
          key={cfg.key}
          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-card p-4"
        >
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            {cfg.label} — Aylıq Trend ({cfg.unit})
          </h3>
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="monthName"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                formatter={(v: number) => [fmt(v), cfg.label]}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}
                labelStyle={{ fontWeight: 600, color: '#334155' }}
              />
              <Line
                type="monotone"
                dataKey={cfg.key}
                stroke={cfg.color}
                strokeWidth={2.5}
                dot={{ r: 4, fill: cfg.color, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              >
                <LabelList
                  dataKey={cfg.key}
                  position="top"
                  style={{ fontSize: 9, fill: '#64748b' }}
                  formatter={fmt}
                />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  )
}

interface KpiAlertsPageProps {
  filters?: Filter
  onFiltersChange?: (f: Filter) => void
}

export default function KpiAlertsPage({ filters = {}, onFiltersChange }: KpiAlertsPageProps) {
  const [kpis, setKpis] = useState<KpiItem[]>([])
  const [loading, setLoading] = useState(true)
  const [shareKpi, setShareKpi] = useState<KpiItem | null>(null)

  const fetchKpis = useCallback(async (f: Filter) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (f.dateFrom)           params.set('date_from', f.dateFrom)
      if (f.dateTo)             params.set('date_to', f.dateTo)
      if (f.sobe)               params.set('sobe', f.sobe)
      if (f.category)           params.set('category', f.category)
      if (f.maliTipi)           params.set('mali_tipi', f.maliTipi)
      if (f.xususiyyetQrupu)    params.set('xususiyyet_qrupu', f.xususiyyetQrupu)
      const res = await fetch(`${API_BASE}/api/kpi-alerts?${params}`)
      const data = await res.json()
      setKpis(Array.isArray(data) ? data : [])
    } catch {
      // keep previous
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKpis(filters)
  }, [filters, fetchKpis])

  const SHOW_IDS = ['total_sales', 'total_volume', 'profit']
  const displayKpis = kpis.filter(k => SHOW_IDS.includes(k.id))

  const activeFilters = [
    filters.sobe,
    filters.category,
    filters.maliTipi,
    filters.xususiyyetQrupu,
  ].filter(Boolean) as string[]

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto bg-surface-2 dark:bg-slate-900 p-6">
      {shareKpi && (
        <EmailModal
          kpi={shareKpi}
          filters={filters}
          onClose={() => setShareKpi(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">KPI Monitorinq</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {loading ? 'Yüklənir...' : 'Bütün KPI-lar normal səviyyədədir'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeFilters.map((v, i) => (
            <span key={i} className="px-2 py-1 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 text-xs font-medium rounded-full border border-brand-100 dark:border-brand-800">
              {v}
            </span>
          ))}
          {onFiltersChange && (
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 shadow-sm">
              <CalendarDays size={13} className="text-slate-400 flex-shrink-0" />
              <input
                type="date"
                value={filters.dateFrom || ''}
                onChange={e => onFiltersChange({ ...filters, dateFrom: e.target.value || undefined })}
                className="text-xs bg-transparent outline-none text-slate-600 dark:text-slate-300 w-[120px]"
              />
              <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
              <input
                type="date"
                value={filters.dateTo || ''}
                onChange={e => onFiltersChange({ ...filters, dateTo: e.target.value || undefined })}
                className="text-xs bg-transparent outline-none text-slate-600 dark:text-slate-300 w-[120px]"
              />
              {(filters.dateFrom || filters.dateTo) && (
                <button
                  onClick={() => onFiltersChange({ ...filters, dateFrom: undefined, dateTo: undefined })}
                  className="ml-0.5 text-slate-300 hover:text-red-400 transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 size={24} className="text-brand-600 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {displayKpis.map(kpi => (
              <KpiCard key={kpi.id} kpi={kpi} onShare={setShareKpi} />
            ))}
          </div>
          <TrendCharts filters={filters} />
        </>
      )}
    </div>
  )
}
