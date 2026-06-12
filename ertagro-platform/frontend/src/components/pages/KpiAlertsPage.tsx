'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, AlertTriangle,
  DollarSign, Package, Target, BarChart2, Tag, CreditCard,
  Loader2, Send, X, CheckCircle, Mail,
} from 'lucide-react'
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
}

const ICON_MAP: Record<string, React.ElementType> = {
  total_sales: DollarSign,
  total_volume: Package,
  profit: TrendingUp,
  avg_price: Tag,
  low_stock: AlertTriangle,
  cashback: CreditCard,
}

function formatValue(value: number, unit: string): string {
  if (unit === '₼' || unit === 'kq') {
    const v = Math.abs(value)
    if (v >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
    if (v >= 1_000) return `${(value / 1_000).toFixed(1)}K`
    return value.toLocaleString('az-AZ', { maximumFractionDigits: 2 })
  }
  if (unit === '₼/kq') return value.toFixed(2)
  if (unit === 'mal') return Math.round(value).toString()
  return value.toLocaleString()
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
    filters.anbar && `Anbar: ${filters.anbar}`,
    filters.sobe && `Şöbə: ${filters.sobe}`,
    filters.category && `Kateqoriya: ${filters.category}`,
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
          kpi_value: formatValue(kpi.value, kpi.unit),
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

        {/* KPI preview */}
        <div className="bg-brand-50 border border-brand-100 rounded-xl p-3 mb-4">
          <p className="text-xs text-slate-500 mb-1">{kpi.label}</p>
          <p className="text-xl font-bold text-slate-800">
            {formatValue(kpi.value, kpi.unit)}
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
  const isAlert = kpi.alert

  return (
    <div className={`rounded-2xl p-5 shadow-card border transition-all ${
      isAlert
        ? 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10'
        : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isAlert ? 'bg-red-100 dark:bg-red-900/30' : 'bg-brand-50 dark:bg-brand-900/30'
          }`}>
            {isAlert
              ? <AlertTriangle size={18} className="text-red-500" />
              : <Icon size={18} className="text-brand-600 dark:text-brand-400" />
            }
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</p>
            {isAlert
              ? <span className="text-xs font-semibold text-red-500">⚠ Hədd aşıldı</span>
              : <span className="text-xs text-slate-400 dark:text-slate-500">{kpi.period}</span>
            }
          </div>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
          isUp
            ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400'
            : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
        }`}>
          {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {kpi.change > 0 ? '+' : ''}{kpi.change}%
        </div>
      </div>

      <div className="mb-3">
        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          {formatValue(kpi.value, kpi.unit)}
          <span className="text-sm font-medium text-slate-400 dark:text-slate-500 ml-1">{kpi.unit}</span>
        </p>
        {kpi.threshold > 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Hədd: {formatValue(kpi.threshold, kpi.unit)} {kpi.unit}
          </p>
        )}
      </div>

      {kpi.threshold > 0 && (
        <div className="mb-3">
          <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isAlert ? 'bg-red-400' : 'bg-brand-500'}`}
              style={{ width: `${Math.min(100, (kpi.value / (kpi.threshold * 1.5)) * 100)}%` }}
            />
          </div>
        </div>
      )}

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

interface KpiAlertsPageProps {
  filters?: Filter
}

export default function KpiAlertsPage({ filters = {} }: KpiAlertsPageProps) {
  const [kpis, setKpis] = useState<KpiItem[]>([])
  const [loading, setLoading] = useState(true)
  const [shareKpi, setShareKpi] = useState<KpiItem | null>(null)

  const fetchKpis = useCallback(async (f: Filter) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (f.dateFrom)  params.set('date_from', f.dateFrom)
      if (f.dateTo)    params.set('date_to', f.dateTo)
      if (f.anbar)     params.set('anbar', f.anbar)
      if (f.sobe)      params.set('sobe', f.sobe)
      if (f.category)  params.set('category', f.category)
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
  const alertCount = displayKpis.filter(k => k.alert).length

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
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">KPI Monitorinq</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {loading ? 'Yüklənir...' : alertCount > 0
              ? <span className="text-red-500 font-medium">{alertCount} KPI hədd aşmışdır</span>
              : 'Bütün KPI-lar normal səviyyədədir'
            }
          </p>
        </div>
        {(filters.anbar || filters.sobe || filters.category || filters.dateFrom) && (
          <div className="flex flex-wrap gap-1.5">
            {[filters.anbar, filters.sobe, filters.category, filters.dateFrom && `${filters.dateFrom}${filters.dateTo ? ' → ' + filters.dateTo : ''}`]
              .filter(Boolean)
              .map((v, i) => (
                <span key={i} className="px-2 py-1 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 text-xs font-medium rounded-full border border-brand-100 dark:border-brand-800">
                  {v}
                </span>
              ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 size={24} className="text-brand-600 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {displayKpis.map(kpi => (
            <KpiCard key={kpi.id} kpi={kpi} onShare={setShareKpi} />
          ))}
        </div>
      )}
    </div>
  )
}
