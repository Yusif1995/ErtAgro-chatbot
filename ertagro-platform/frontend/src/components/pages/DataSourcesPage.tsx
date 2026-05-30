'use client'

import { useState, useEffect } from 'react'
import {
  Database, ChevronRight, ChevronDown, Hash, Type,
  Calendar, ToggleLeft, Loader2, RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { SchemaTable } from '@/types'

const TYPE_ICONS: Record<string, React.ElementType> = {
  Text: Type,
  Integer: Hash,
  Decimal: Hash,
  Double: Hash,
  Boolean: ToggleLeft,
  DateTime: Calendar,
  Date: Calendar,
}

const TYPE_COLORS: Record<string, string> = {
  Text: 'bg-blue-50 text-blue-600',
  Integer: 'bg-purple-50 text-purple-600',
  Decimal: 'bg-purple-50 text-purple-600',
  Double: 'bg-purple-50 text-purple-600',
  Boolean: 'bg-orange-50 text-orange-600',
  DateTime: 'bg-green-50 text-green-600',
  Date: 'bg-green-50 text-green-600',
}

function TableRow({ table }: { table: SchemaTable }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
          <Database size={14} className="text-brand-600" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-slate-800">{table.name}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {table.columns.length} sütun
            {table.measures.length > 0 && ` · ${table.measures.length} ölçü`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {['Text', 'Integer', 'DateTime'].map((t) => {
              const count = table.columns.filter((c) => c.type === t).length
              if (!count) return null
              const color = TYPE_COLORS[t] || 'bg-slate-50 text-slate-500'
              return (
                <span key={t} className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
                  {t} ({count})
                </span>
              )
            })}
          </div>
          {expanded ? (
            <ChevronDown size={16} className="text-slate-400" />
          ) : (
            <ChevronRight size={16} className="text-slate-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3">
          {table.columns.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Sütunlar
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {table.columns.map((col) => {
                  const Icon = TYPE_ICONS[col.type] || Hash
                  const color = TYPE_COLORS[col.type] || 'bg-slate-50 text-slate-500'
                  return (
                    <div
                      key={col.name}
                      className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg"
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center ${color}`}>
                        <Icon size={10} />
                      </div>
                      <span className="text-xs text-slate-700 truncate flex-1">{col.name}</span>
                      <span className="text-xs text-slate-400 flex-shrink-0">{col.type}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {table.measures.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Ölçülər (Measures)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {table.measures.map((m) => (
                  <span
                    key={m}
                    className="text-xs px-2.5 py-1 bg-brand-50 text-brand-700 rounded-lg font-medium border border-brand-100"
                  >
                    [{m}]
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function DataSourcesPage() {
  const [schema, setSchema] = useState<SchemaTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const fetchSchema = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getSchema()
      setSchema(data.tables || [])
    } catch {
      setError('Schema yüklənə bilmədi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSchema() }, [])

  const filtered = schema.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.columns.some((c) => c.name.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto bg-surface-2 p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Data Mənbələri</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {schema.length} cədvəl ·{' '}
            {schema.reduce((s, t) => s + t.columns.length, 0)} sütun ·{' '}
            {schema.reduce((s, t) => s + t.measures.length, 0)} ölçü
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Axtarış..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 focus:outline-none focus:border-brand-400 bg-white w-48"
          />
          <button
            onClick={fetchSchema}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={12} />
            Yenilə
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 size={24} className="text-brand-600 animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((table) => (
            <TableRow key={table.name} table={table} />
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-sm text-slate-400">
              Nəticə tapılmadı
            </div>
          )}
        </div>
      )}
    </div>
  )
}
