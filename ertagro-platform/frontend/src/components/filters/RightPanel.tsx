'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import type { RefreshStatus, Filter } from '@/types'

interface RightPanelProps {
  filters: Filter
  onFiltersChange: (filters: Filter) => void
  onQuestionSelect?: (question: string) => void
}

export default function RightPanel({
  filters,
  onFiltersChange,
}: RightPanelProps) {
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [filterOptions, setFilterOptions] = useState<Record<string, string[]>>({})

  useEffect(() => {
    api.getRefreshStatus().then(setRefreshStatus).catch(console.error)
    api.getFilterValues()
      .then((data) => setFilterOptions(data || {}))
      .catch(() => setFilterOptions({}))
  }, [])

  const handleFilterChange = (key: keyof Filter, value: string) => {
    onFiltersChange({ ...filters, [key]: value || undefined })
  }

  const handleReset = () => {
    onFiltersChange({})
  }

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const result = await api.triggerRefresh()
      setRefreshStatus((prev) => ({
        ...prev,
        status: result.status,
        message: result.message,
        last_refresh: result.last_refresh || prev?.last_refresh || '—',
        next_refresh: prev?.next_refresh || '—',
      }))
    } catch {
      // keep previous status
    } finally {
      setRefreshing(false)
    }
  }, [])

  const getOptions = (possibleNames: string[]): string[] => {
    for (const name of possibleNames) {
      const vals = filterOptions[name]
      if (vals?.length) return vals
    }
    return []
  }

  const sobeOptions     = getOptions(['Şöbə', 'Sobe', 'şöbə'])
  const catOptions      = getOptions(['Kateqoriya', 'Məhsul Kateqoriyası', 'Category', 'kateqoriya'])
  const tipOptions      = getOptions(['Malın Tipi', 'Tip', 'Mali Tipi'])
  const xusOptions      = getOptions(['Xüsusiyyət Qrupu', 'Xususiyyet Qrupu'])

  const inputCls = "w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-100 dark:focus:ring-brand-900"

  return (
    <aside className="bg-white dark:bg-slate-800 border-l border-slate-100 dark:border-slate-700 flex flex-col overflow-y-auto flex-shrink-0 w-72">
      <div className="p-4 space-y-5">

        {/* Filters */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Filtrlər</h3>
            <button onClick={handleReset} className="text-xs text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
              Sıfırla
            </button>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Tarix Aralığı</label>
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Başlanğıc</p>
                <input type="date" value={filters.dateFrom || ''} onChange={(e) => handleFilterChange('dateFrom', e.target.value)} className={inputCls} />
              </div>
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Son</p>
                <input type="date" value={filters.dateTo || ''} onChange={(e) => handleFilterChange('dateTo', e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Şöbə</label>
              <select value={filters.sobe || ''} onChange={(e) => handleFilterChange('sobe', e.target.value)} className={inputCls}>
                <option value="">Bütün şöbələr</option>
                {sobeOptions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Məhsul Kateqoriyası</label>
              <select value={filters.category || ''} onChange={(e) => handleFilterChange('category', e.target.value)} className={inputCls}>
                <option value="">Bütün kateqoriyalar</option>
                {catOptions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Malın Tipi</label>
              <select value={filters.maliTipi || ''} onChange={(e) => handleFilterChange('maliTipi', e.target.value)} className={inputCls}>
                <option value="">Bütün tiplər</option>
                {tipOptions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Məhsul Xüsusiyyəti</label>
              <select value={filters.xususiyyetQrupu || ''} onChange={(e) => handleFilterChange('xususiyyetQrupu', e.target.value)} className={inputCls}>
                <option value="">Bütün xüsusiyyətlər</option>
                {xusOptions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
        </section>

        <hr className="border-slate-100 dark:border-slate-700" />

        {/* Refresh Status */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Data Refresh</h3>
            <button onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-1 text-xs text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors disabled:opacity-50" title="Yenilə">
              <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Yenilənir...' : 'Yenilə'}
            </button>
          </div>
          <div className="bg-brand-50 dark:bg-brand-900/20 rounded-xl p-3 border border-brand-100 dark:border-brand-800">
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${refreshStatus?.status === 'error' ? 'bg-red-500' : 'bg-brand-500'}`} />
              <span className={`text-xs font-semibold ${refreshStatus?.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-brand-700 dark:text-brand-400'}`}>
                {refreshStatus?.status === 'error' ? 'Xəta' : 'Aktiv'}
              </span>
            </div>
            {refreshStatus ? (
              <div className="space-y-1">
                <p className="text-xs text-slate-500 dark:text-slate-400"><span className="font-medium">Son yenilənmə:</span> {refreshStatus.last_refresh}</p>
                {refreshStatus.dataset && <p className="text-xs text-slate-500 dark:text-slate-400"><span className="font-medium">Dataset:</span> {refreshStatus.dataset}</p>}
              </div>
            ) : (
              <div className="space-y-1.5 animate-pulse">
                <div className="h-3 bg-brand-100 dark:bg-brand-800 rounded w-3/4" />
                <div className="h-3 bg-brand-100 dark:bg-brand-800 rounded w-1/2" />
              </div>
            )}
          </div>
        </section>

      </div>
    </aside>
  )
}
