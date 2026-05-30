'use client'

import { useState, useEffect } from 'react'
import {
  LineChart, Line, ResponsiveContainer, Tooltip,
} from 'recharts'
import {
  TrendingUp, Loader2, AlertCircle, RefreshCw,
  CheckCircle, Database, Brain,
} from 'lucide-react'
import { useForecast } from '@/hooks/useForecast'
import { api } from '@/lib/api'
import type { ForecastRequest } from '@/types'

const INITIAL_FORM: ForecastRequest = {
  product: '',
  region: '',
  price: 0.89,
  volume: 500,
  season: 'Yay',
  currency: 'AZN',
}

interface ModelMeta {
  is_trained: boolean
  accuracy: number | null
  r2: number | null
  training_rows: number
  trained_at: string | null
  data_source: string
}

function formatSales(value: number, currency: string): string {
  if (currency === 'USD') {
    const usd = value / 1.7
    if (usd >= 1_000_000) return `$ ${(usd / 1_000_000).toFixed(2)}M`
    return `$ ${usd.toLocaleString()}`
  }
  if (value >= 1_000_000) return `₼ ${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `₼ ${(value / 1_000).toFixed(1)}K`
  return `₼ ${value.toLocaleString()}`
}

function TrendLineMini({ data }: { data: number[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const chartData = data.map((v, i) => ({ x: i, y: v }))
  if (!mounted) return <div className="h-[60px] animate-pulse rounded bg-slate-100" />
  return (
    <ResponsiveContainer width="100%" height={60}>
      <LineChart data={chartData}>
        <Line type="monotone" dataKey="y" stroke="#16a34a" strokeWidth={2} dot={false} />
        <Tooltip
          formatter={(v: number) => [`₼ ${v.toLocaleString()}`, '']}
          labelFormatter={() => ''}
          contentStyle={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 8px' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  real:      { label: 'Real PBI data',   color: 'text-brand-600 bg-brand-50' },
  augmented: { label: 'PBI + sintetik',  color: 'text-blue-600 bg-blue-50'   },
  synthetic: { label: 'Sintetik data',   color: 'text-orange-600 bg-orange-50' },
  fallback:  { label: 'Əsas model',      color: 'text-slate-500 bg-slate-100' },
  not_trained:{ label: 'Train edilməyib', color: 'text-red-500 bg-red-50'    },
}

export default function MLForecast() {
  const [form, setForm] = useState<ForecastRequest>(INITIAL_FORM)
  const { result, loading, error, getForecast } = useForecast()
  const [meta, setMeta] = useState<ModelMeta | null>(null)
  const [retraining, setRetraining] = useState(false)
  const [retrainMsg, setRetrainMsg] = useState('')
  const [products, setProducts] = useState<string[]>([])
  const [sobes, setSobes] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/ml-status').then(r => r.json()).then(setMeta).catch(() => {})

    // Real filter dəyərlərini yüklə
    api.getFilterValues().then((data: Record<string, string[]>) => {
      // Məhsul: Kateqoriya və ya Məhsul Kateqoriyası sütunu
      const prods =
        data['Kateqoriya'] ||
        data['Məhsul Kateqoriyası'] ||
        data['Category'] ||
        []
      // Şöbə
      const sb = data['Şöbə'] || data['Sobe'] || data['şöbə'] || []

      setProducts(prods)
      setSobes(sb)

      // Form-un ilk dəyərini real dataya uyğunlaşdır
      setForm(prev => ({
        ...prev,
        product: prods[0] || prev.product,
        region:  sb[0]    || prev.region,
      }))
    }).catch(() => {})
  }, [])

  const handleChange = (key: keyof ForecastRequest, value: string | number) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSubmit = () => { getForecast(form) }

  const handleRetrain = async () => {
    setRetraining(true)
    setRetrainMsg('')
    try {
      const res = await fetch('/api/ml-train', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setRetrainMsg(`✓ Train tamamlandı — ${data.rows} sətir, dəqiqlik: ${data.accuracy}%`)
        fetch('/api/ml-status').then(r => r.json()).then(setMeta).catch(() => {})
      } else {
        setRetrainMsg(`Xəta: ${data.detail || 'naməlum'}`)
      }
    } catch {
      setRetrainMsg('Bağlantı xətası')
    } finally {
      setRetraining(false)
    }
  }

  const src = meta?.data_source || 'not_trained'
  const srcInfo = SOURCE_LABELS[src] || SOURCE_LABELS.not_trained

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-card">

      {/* Model Status Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Brain size={14} className="text-brand-600" />
            <span className="text-xs font-semibold text-slate-700">GradientBoosting Model</span>
          </div>
          {meta && (
            <>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${srcInfo.color}`}>
                {srcInfo.label}
              </span>
              {meta.accuracy != null && (
                <div className="flex items-center gap-1.5">
                  <CheckCircle size={12} className="text-brand-500" />
                  <span className="text-xs text-slate-600">
                    Dəqiqlik: <span className="font-semibold text-brand-700">{meta.accuracy}%</span>
                  </span>
                </div>
              )}
              {meta.training_rows > 0 && (
                <div className="flex items-center gap-1.5">
                  <Database size={12} className="text-slate-400" />
                  <span className="text-xs text-slate-500">{meta.training_rows} sətir</span>
                </div>
              )}
              {meta.trained_at && (
                <span className="text-xs text-slate-400">{meta.trained_at}</span>
              )}
            </>
          )}
        </div>

        <button
          onClick={handleRetrain}
          disabled={retraining}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-white hover:text-brand-700 hover:border-brand-200 disabled:opacity-50 transition-all"
        >
          <RefreshCw size={11} className={retraining ? 'animate-spin' : ''} />
          {retraining ? 'Train edilir...' : 'Modeli Yenilə'}
        </button>
      </div>

      {retrainMsg && (
        <div className={`px-6 py-2 text-xs font-medium ${retrainMsg.startsWith('✓') ? 'text-brand-700 bg-brand-50' : 'text-red-600 bg-red-50'}`}>
          {retrainMsg}
        </div>
      )}

      {/* Body */}
      <div className="px-6 py-4 flex gap-6">
        {/* Input grid */}
        <div className="flex-1 grid grid-cols-3 gap-3">

          {/* Product */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Məhsul Kateqoriyası</label>
            <select
              value={form.product}
              onChange={e => handleChange('product', e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:border-brand-400 bg-white"
            >
              {products.length === 0
                ? <option value="">Yüklənir...</option>
                : products.map(p => <option key={p} value={p}>{p}</option>)
              }
            </select>
          </div>

          {/* Şöbə */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Şöbə</label>
            <select
              value={form.region}
              onChange={e => handleChange('region', e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:border-brand-400 bg-white"
            >
              {sobes.length === 0
                ? <option value="">Yüklənir...</option>
                : sobes.map(s => <option key={s} value={s}>{s}</option>)
              }
            </select>
          </div>

          {/* Price */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Qiymət ₼/kq</label>
            <input
              type="number" min={0} step={0.01} value={form.price}
              onChange={e => handleChange('price', parseFloat(e.target.value) || 0)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:border-brand-400 bg-white"
            />
          </div>

          {/* Volume */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Həcm ton</label>
            <input
              type="number" min={0} value={form.volume}
              onChange={e => handleChange('volume', parseFloat(e.target.value) || 0)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:border-brand-400 bg-white"
            />
          </div>

          {/* Season */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Mövsüm</label>
            <select
              value={form.season}
              onChange={e => handleChange('season', e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:border-brand-400 bg-white"
            >
              {['Yaz', 'Yay', 'Payız', 'Qış'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Currency */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Valyuta</label>
            <select
              value={form.currency}
              onChange={e => handleChange('currency', e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:border-brand-400 bg-white"
            >
              <option>AZN</option>
              <option>USD</option>
            </select>
          </div>

          {/* Submit */}
          <div className="col-span-3">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loading
                ? <><Loader2 size={14} className="animate-spin" />Hesablanır...</>
                : <><TrendingUp size={14} />Proqnozu Hesabla</>
              }
            </button>
          </div>
        </div>

        {/* Result card */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 h-full">
            <h3 className="text-xs font-semibold text-slate-600 mb-3">Proqnoz Nəticəsi</h3>

            {error && (
              <div className="flex items-center gap-2 text-red-500 text-xs">
                <AlertCircle size={13} />{error}
              </div>
            )}

            {!result && !loading && !error && (
              <p className="text-xs text-slate-400 text-center mt-4">
                Parametrləri doldurun və proqnozu hesablayın
              </p>
            )}

            {loading && (
              <div className="space-y-2 animate-pulse mt-2">
                <div className="h-8 bg-slate-200 rounded-lg" />
                <div className="h-4 bg-slate-200 rounded w-3/4" />
                <div className="h-4 bg-slate-200 rounded w-1/2" />
                <div className="h-12 bg-slate-200 rounded-lg" />
              </div>
            )}

            {result && !loading && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500">Gözlənilən Satış</p>
                  <p className="text-xl font-bold text-slate-800">
                    {formatSales(result.expected_sales, form.currency)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white rounded-lg p-2 border border-slate-100">
                    <p className="text-xs text-slate-400">Həcm</p>
                    <p className="text-sm font-semibold text-slate-700">{result.expected_volume} ton</p>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-slate-100">
                    <p className="text-xs text-slate-400">Dəyişim</p>
                    <p className={`text-sm font-semibold ${result.change_vs_prev >= 0 ? 'text-brand-600' : 'text-red-500'}`}>
                      {result.change_vs_prev >= 0 ? '+' : ''}{result.change_vs_prev}%
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Etibar:</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
                    {result.confidence}%
                  </span>
                </div>
                {result.trend_data && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1">5 Aylıq Trend</p>
                    <TrendLineMini data={result.trend_data} />
                  </div>
                )}
                <p className="text-xs text-slate-500 leading-relaxed">{result.explanation}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
