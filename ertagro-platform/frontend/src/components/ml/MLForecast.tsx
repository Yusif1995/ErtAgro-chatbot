'use client'

import { useState, useEffect } from 'react'
import {
  LineChart, Line, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import {
  TrendingUp, Loader2, AlertCircle, RefreshCw,
  CheckCircle, Database, Brain,
} from 'lucide-react'
import { useForecast } from '@/hooks/useForecast'
import { api } from '@/lib/api'
import type { ForecastRequest, ForecastResponse } from '@/types'

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

  // Comparison Mode States
  const [isComparisonMode, setIsComparisonMode] = useState(false)
  const [formB, setFormB] = useState<ForecastRequest>(INITIAL_FORM)
  const [resultA, setResultA] = useState<ForecastResponse | null>(null)
  const [resultB, setResultB] = useState<ForecastResponse | null>(null)
  const [loadingCompare, setLoadingCompare] = useState(false)
  const [errorCompare, setErrorCompare] = useState<string | null>(null)

  // Sync result from single forecast to resultA
  useEffect(() => {
    if (result) {
      setResultA(result)
    }
  }, [result])

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

  const handleCompareSubmit = async () => {
    setLoadingCompare(true)
    setErrorCompare(null)
    try {
      const [resA, resB] = await Promise.all([
        api.forecast(form),
        api.forecast(formB)
      ])
      setResultA(resA)
      setResultB(resB)
    } catch (err) {
      setErrorCompare('Ssenarilər üzrə proqnoz hesablana bilmədi. Zəhmət olmasa yenidən cəhd edin.')
    } finally {
      setLoadingCompare(false)
    }
  }

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

      {/* Mode Toggle Switch Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/30">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Satış Proqnozu Modelləşdirilməsi</h2>
          <p className="text-xs text-slate-400 mt-0.5">Məhsul, şöbə, qiymət və həcm dəyişənlərinə görə gələcək satışların proqnozlaşdırılması</p>
        </div>
        <div className="flex items-center bg-slate-100 dark:bg-slate-700/50 p-1 rounded-xl border border-slate-200/50 dark:border-slate-600/30">
          <button
            onClick={() => setIsComparisonMode(false)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              !isComparisonMode
                ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Tək Ssenari
          </button>
          <button
            onClick={() => {
              setIsComparisonMode(true)
              setFormB(prev => prev.product === '' ? {
                ...form,
                price: parseFloat((form.price * 1.1).toFixed(2)),
                volume: Math.round(form.volume * 1.05)
              } : prev)
            }}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              isComparisonMode
                ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Ssenari Müqayisəsi
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-6 flex flex-col gap-6">
        
        {isComparisonMode ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Ssenari A Inputs */}
              <div className="bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl p-5 border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
                <h3 className="text-sm font-bold text-teal-700 dark:text-teal-400 mb-4 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-600 dark:bg-teal-400 animate-pulse"></span>
                  Ssenari A
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Məhsul Kateqoriyası</label>
                    <select
                      value={form.product}
                      onChange={e => handleChange('product', e.target.value)}
                      className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                    >
                      {products.length === 0
                        ? <option value="">Yüklənir...</option>
                        : products.map(p => <option key={p} value={p}>{p}</option>)
                      }
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Şöbə</label>
                    <select
                      value={form.region}
                      onChange={e => handleChange('region', e.target.value)}
                      className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                    >
                      {sobes.length === 0
                        ? <option value="">Yüklənir...</option>
                        : sobes.map(s => <option key={s} value={s}>{s}</option>)
                      }
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Qiymət ₼/kq</label>
                    <input
                      type="number" min={0} step={0.01} value={form.price}
                      onChange={e => handleChange('price', parseFloat(e.target.value) || 0)}
                      className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Həcm ton</label>
                    <input
                      type="number" min={0} value={form.volume}
                      onChange={e => handleChange('volume', parseFloat(e.target.value) || 0)}
                      className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Mövsüm</label>
                    <select
                      value={form.season}
                      onChange={e => handleChange('season', e.target.value)}
                      className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                    >
                      {['Yaz', 'Yay', 'Payız', 'Qış'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Valyuta</label>
                    <select
                      value={form.currency}
                      onChange={e => handleChange('currency', e.target.value)}
                      className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                    >
                      <option>AZN</option>
                      <option>USD</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Ssenari B Inputs */}
              <div className="bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl p-5 border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
                <h3 className="text-sm font-bold text-orange-600 dark:text-orange-400 mb-4 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse"></span>
                  Ssenari B
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Məhsul Kateqoriyası</label>
                    <select
                      value={formB.product}
                      onChange={e => setFormB(prev => ({ ...prev, product: e.target.value }))}
                      className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                    >
                      {products.length === 0
                        ? <option value="">Yüklənir...</option>
                        : products.map(p => <option key={p} value={p}>{p}</option>)
                      }
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Şöbə</label>
                    <select
                      value={formB.region}
                      onChange={e => setFormB(prev => ({ ...prev, region: e.target.value }))}
                      className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                    >
                      {sobes.length === 0
                        ? <option value="">Yüklənir...</option>
                        : sobes.map(s => <option key={s} value={s}>{s}</option>)
                      }
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Qiymət ₼/kq</label>
                    <input
                      type="number" min={0} step={0.01} value={formB.price}
                      onChange={e => setFormB(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                      className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Həcm ton</label>
                    <input
                      type="number" min={0} value={formB.volume}
                      onChange={e => setFormB(prev => ({ ...prev, volume: parseFloat(e.target.value) || 0 }))}
                      className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Mövsüm</label>
                    <select
                      value={formB.season}
                      onChange={e => setFormB(prev => ({ ...prev, season: e.target.value }))}
                      className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                    >
                      {['Yaz', 'Yay', 'Payız', 'Qış'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Valyuta</label>
                    <select
                      value={formB.currency}
                      onChange={e => setFormB(prev => ({ ...prev, currency: e.target.value }))}
                      className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                    >
                      <option>AZN</option>
                      <option>USD</option>
                    </select>
                  </div>
                </div>
              </div>

            </div>

            {/* Compare Action Button */}
            <div className="flex justify-start">
              <button
                onClick={handleCompareSubmit}
                disabled={loadingCompare}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg active:scale-95 animate-fade-in"
              >
                {loadingCompare
                  ? <><Loader2 size={15} className="animate-spin" />Hesablanır...</>
                  : <><TrendingUp size={15} />Ssenariləri Müqayisə Et</>
                }
              </button>
            </div>

            {errorCompare && (
              <div className="flex items-center gap-2 text-red-500 text-xs bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-200/30">
                <AlertCircle size={14} />{errorCompare}
              </div>
            )}
          </div>
        ) : (
          /* SINGLE SCENARIO MODE */
          <div className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="col-span-2 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Məhsul Kateqoriyası</label>
                <select
                  value={form.product}
                  onChange={e => handleChange('product', e.target.value)}
                  className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                >
                  {products.length === 0
                    ? <option value="">Yüklənir...</option>
                    : products.map(p => <option key={p} value={p}>{p}</option>)
                  }
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Şöbə</label>
                <select
                  value={form.region}
                  onChange={e => handleChange('region', e.target.value)}
                  className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                >
                  {sobes.length === 0
                    ? <option value="">Yüklənir...</option>
                    : sobes.map(s => <option key={s} value={s}>{s}</option>)
                  }
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Qiymət ₼/kq</label>
                <input
                  type="number" min={0} step={0.01} value={form.price}
                  onChange={e => handleChange('price', parseFloat(e.target.value) || 0)}
                  className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Həcm ton</label>
                <input
                  type="number" min={0} value={form.volume}
                  onChange={e => handleChange('volume', parseFloat(e.target.value) || 0)}
                  className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Mövsüm</label>
                <select
                  value={form.season}
                  onChange={e => handleChange('season', e.target.value)}
                  className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                >
                  {['Yaz', 'Yay', 'Payız', 'Qış'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Valyuta</label>
                <select
                  value={form.currency}
                  onChange={e => handleChange('currency', e.target.value)}
                  className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-400 bg-white dark:bg-slate-800"
                >
                  <option>AZN</option>
                  <option>USD</option>
                </select>
              </div>

              <div className="col-span-2 pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {loading
                    ? <><Loader2 size={14} className="animate-spin" />Hesablanır...</>
                    : <><TrendingUp size={14} />Proqnozu Hesabla</>
                  }
                </button>
              </div>
            </div>

            {/* Single mode result card */}
            <div className="bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 p-5 shadow-sm">
              <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-4">Proqnoz Nəticəsi</h3>

              {error && (
                <div className="flex items-center gap-2 text-red-500 text-xs">
                  <AlertCircle size={14} />{error}
                </div>
              )}

              {!resultA && !loading && !error && (
                <p className="text-xs text-slate-400 text-center mt-6">
                  Parametrləri daxil edin və proqnozu hesablayın
                </p>
              )}

              {loading && (
                <div className="space-y-3 animate-pulse mt-2">
                  <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                  <div className="h-16 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                </div>
              )}

              {resultA && !loading && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Gözlənilən Satış</p>
                    <p className="text-2xl font-black text-slate-800 dark:text-white">
                      {formatSales(resultA.expected_sales, form.currency)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-slate-200/40 dark:border-slate-700/40 shadow-sm">
                      <p className="text-xs text-slate-400">Həcm</p>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{resultA.expected_volume} ton</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-slate-200/40 dark:border-slate-700/40 shadow-sm">
                      <p className="text-xs text-slate-400">Dəyişim</p>
                      <p className={`text-sm font-bold ${resultA.change_vs_prev >= 0 ? 'text-brand-600' : 'text-red-500'}`}>
                        {resultA.change_vs_prev >= 0 ? '+' : ''}{resultA.change_vs_prev}%
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Etibar dərəcəsi:</span>
                    <span className="font-bold px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400">
                      {resultA.confidence}%
                    </span>
                  </div>
                  {resultA.trend_data && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1.5 font-medium">5 Aylıq Trend</p>
                      <TrendLineMini data={resultA.trend_data} />
                    </div>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200/40 dark:border-slate-700/40">{resultA.explanation}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* COMPARISON RESULTS MODULE */}
        {isComparisonMode && resultA && resultB && !loadingCompare && (
          <div className="border-t border-slate-200/60 dark:border-slate-700/50 pt-6 mt-2">
            <div className="flex flex-col lg:flex-row gap-6">
              
              {/* Summary Metrics Cards */}
              <div className="w-full lg:w-80 flex flex-col gap-4">
                <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Müqayisə Xülasəsi</h3>
                
                {/* expected sales comparison card */}
                <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-5 border border-slate-200/60 dark:border-slate-700/50 shadow-sm">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-3">Gözlənilən Satış</p>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] text-teal-600 dark:text-teal-400 font-bold uppercase tracking-wider">Ssenari A</p>
                      <p className="text-lg font-black text-teal-700 dark:text-teal-400">
                        {formatSales(resultA.expected_sales, form.currency)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-orange-500 font-bold uppercase tracking-wider">Ssenari B</p>
                      <p className="text-lg font-black text-orange-600 dark:text-orange-400">
                        {formatSales(resultB.expected_sales, formB.currency)}
                      </p>
                    </div>
                  </div>
                  
                  {/* Difference percentage calculation */}
                  {resultA.expected_sales > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-200/50 dark:border-slate-700/50 flex justify-between items-center text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Fərq (B vs A):</span>
                      {(() => {
                        const diffPercent = ((resultB.expected_sales - resultA.expected_sales) / resultA.expected_sales) * 100
                        return (
                          <span className={`font-bold px-2 py-0.5 rounded-full ${diffPercent >= 0 ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                            {diffPercent >= 0 ? '+' : ''}{diffPercent.toFixed(1)}%
                          </span>
                        )
                      })()}
                    </div>
                  )}
                </div>

                {/* expected volume and confidence cards */}
                <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-700/50 space-y-3 shadow-sm">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Həcm (A vs B):</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {resultA.expected_volume} t vs {resultB.expected_volume} t
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Etibar dərəcəsi:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {resultA.confidence}% vs {resultB.confidence}%
                    </span>
                  </div>
                </div>

                {/* Scenario details */}
                <div className="text-xs text-slate-500 dark:text-slate-400 space-y-3 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 shadow-sm">
                  <p className="font-bold text-slate-600 dark:text-slate-300 mb-1">Təsvir:</p>
                  <p className="bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200/40 dark:border-slate-700/40"><span className="font-bold text-teal-600">A:</span> {resultA.explanation}</p>
                  <p className="bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200/40 dark:border-slate-700/40"><span className="font-bold text-orange-500">B:</span> {resultB.explanation}</p>
                </div>
              </div>

              {/* Side-by-side Scenario Comparison Bar Chart */}
              <div className="flex-1 bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-5 border border-slate-200/60 dark:border-slate-700/50 shadow-sm">
                <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-4">
                  Ssenari müqayisə qrafiki (Pessimist vs Base vs Optimist)
                </h3>
                <div className="h-[320px] w-full bg-white dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200/40 dark:border-slate-700/40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        {
                          name: 'Pessimist (-15%)',
                          'Ssenari A': Math.round(resultA.expected_sales * 0.85),
                          'Ssenari B': Math.round(resultB.expected_sales * 0.85),
                        },
                        {
                          name: 'Base (Gözlənilən)',
                          'Ssenari A': resultA.expected_sales,
                          'Ssenari B': resultB.expected_sales,
                        },
                        {
                          name: 'Optimist (+15%)',
                          'Ssenari A': Math.round(resultA.expected_sales * 1.15),
                          'Ssenari B': Math.round(resultB.expected_sales * 1.15),
                        }
                      ]}
                      margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis tickFormatter={(v) => formatSales(v, form.currency)} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip
                        formatter={(value: any, name: any) => [
                          formatSales(value as number, form.currency),
                          name
                        ]}
                        contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                      <Bar dataKey="Ssenari A" fill="#0f766e" radius={[4, 4, 0, 0]} name="Ssenari A" />
                      <Bar dataKey="Ssenari B" fill="#f97316" radius={[4, 4, 0, 0]} name="Ssenari B" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  )
}
