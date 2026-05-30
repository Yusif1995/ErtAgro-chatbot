'use client'

import { useState } from 'react'
import { Maximize2, Download, GitCompare, TrendingUp, CheckCircle, X, Bot } from 'lucide-react'
import clsx from 'clsx'
import ChatChart from './ChatChart'
import type { Message } from '@/types'

// Tam rəqəm formatı — M/K yoxdur, manat işarəsi var
function fmtNum(val: string | number): string {
  const n = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(n)) return String(val)
  return n.toLocaleString('az-AZ', { maximumFractionDigits: 2 })
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return ''
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } catch { return '' }
}

// CSV export
function exportToCSV(rows: Record<string, string | number>[], filename = 'ertAgro_export') {
  if (!rows?.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(',')),
  ].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}_${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// Chart modal
function ChartModal({ chart, onClose }: { chart: NonNullable<Message['chatResponse']>['chart']; onClose: () => void }) {
  if (!chart) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[800px] max-w-[95vw] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{chart.title || 'Vizual'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-600 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            <X size={15} className="text-slate-500 dark:text-slate-400" />
          </button>
        </div>
        <div className="h-[420px]"><ChatChart chart={chart} height={400} /></div>
      </div>
    </div>
  )
}

interface MessageBubbleProps {
  message: Message
  onSendMessage?: (msg: string) => void
}

export default function MessageBubble({ message, onSendMessage }: MessageBubbleProps) {
  const [chartOpen, setChartOpen] = useState(false)
  const isAssistant = message.role === 'assistant'
  const cr = message.chatResponse

  if (!isAssistant) {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-lg">
          <div className="bg-brand-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm shadow-sm">
            <p className="text-sm leading-relaxed">{message.content}</p>
          </div>
          <p className="text-xs text-slate-400 mt-1 text-right">
            {formatTimestamp(message.timestamp)}
          </p>
        </div>
        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 mt-1 border border-slate-100 shadow-sm">
          <img src="/logo.png" alt="ErtAgro" className="w-full h-full object-cover" />
        </div>
      </div>
    )
  }

  const handleAction = (type: 'expand' | 'excel' | 'region' | 'trend') => {
    if (type === 'expand') { setChartOpen(true); return }
    if (type === 'excel') { exportToCSV(cr?.rows || [], 'ertAgro'); return }
    if (type === 'region') { onSendMessage?.('Şöbələrə görə satış müqayisəsi göstər') }
    if (type === 'trend') { onSendMessage?.('Bu məhsulların aylıq trend analizini göstər') }
  }

  return (
    <>
      {chartOpen && cr?.chart && (
        <ChartModal chart={cr.chart} onClose={() => setChartOpen(false)} />
      )}

      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
          <Bot size={15} className="text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-slate-700">Ert Agro AI Assistant</span>
            <span className="text-xs text-slate-400">{formatTimestamp(message.timestamp)}</span>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-tl-sm shadow-card dark:shadow-none border border-slate-100 dark:border-slate-700 p-4">
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{message.content}</p>

            {cr?.chart && <ChatChart chart={cr.chart} />}

            {cr?.metrics && cr.metrics.length > 0 && (
              <div className="mt-3 border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-700/50 px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Əsas Göstəricilər</p>
                </div>
                <div className="divide-y divide-slate-50 dark:divide-slate-700">
                  {cr.metrics.map((metric, idx) => {
                    const numVal = parseFloat(metric.value)
                    const displayVal = !isNaN(numVal) && metric.value !== ''
                      ? fmtNum(numVal) + (metric.value.includes('₼') ? ' ₼' : metric.value.includes('%') ? '%' : metric.value.includes('ton') ? ' ton' : '')
                      : metric.value
                    return (
                      <div key={idx} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                        <span className="text-xs text-slate-500 dark:text-slate-400">{metric.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{displayVal}</span>
                          {metric.change && (
                            <span className="text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-1.5 py-0.5 rounded-full">{metric.change}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {cr && (
              <div className="mt-3 flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-1.5">
                  <CheckCircle size={12} className="text-brand-500" />
                  <span className="text-xs text-slate-500 dark:text-slate-400"><span className="font-medium">Mənbə:</span> {cr.source}</span>
                </div>
                <div className="text-xs text-slate-300 dark:text-slate-600">|</div>
                <span className="text-xs text-slate-500 dark:text-slate-400"><span className="font-medium">Model:</span> {cr.model}</span>
                <div className="text-xs text-slate-300 dark:text-slate-600">|</div>
                <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full',
                  cr.confidence >= 90 ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400' : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'
                )}>{cr.confidence}% dəqiqlik</span>
              </div>
            )}

            {cr && (
              <div className="mt-3 flex flex-wrap gap-2">
                {cr.chart && (
                  <button onClick={() => handleAction('expand')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 hover:text-brand-700 dark:hover:text-brand-400 hover:border-brand-200 dark:hover:border-brand-700 transition-all">
                    <Maximize2 size={11} />Vizualı genişləndir
                  </button>
                )}
                {(cr.rows?.length ?? 0) > 0 && (
                  <button onClick={() => handleAction('excel')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 hover:text-brand-700 dark:hover:text-brand-400 hover:border-brand-200 dark:hover:border-brand-700 transition-all">
                    <Download size={11} />Excel-ə ixrac et
                  </button>
                )}
                <button onClick={() => handleAction('region')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 hover:text-brand-700 dark:hover:text-brand-400 hover:border-brand-200 dark:hover:border-brand-700 transition-all">
                  <GitCompare size={11} />Şöbə müqayisəsi
                </button>
                <button onClick={() => handleAction('trend')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 hover:text-brand-700 dark:hover:text-brand-400 hover:border-brand-200 dark:hover:border-brand-700 transition-all">
                  <TrendingUp size={11} />Trend analizi
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
