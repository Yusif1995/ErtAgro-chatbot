'use client'

import { ExternalLink, RefreshCw, Maximize2 } from 'lucide-react'

const REPORT_URL =
  'https://app.powerbi.com/reportEmbed?reportId=e2d90cc1-1255-4ae7-b90b-4c2b4da83f7d&autoAuth=true&ctid=48111fed-faef-48ea-ab8a-8cc1a354fc76'

export default function ReportsPage() {
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-surface-2 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Power BI Hesabatları</h2>
          <p className="text-xs text-slate-500 mt-0.5">ErtAgro Satış & Analitika Hesabatı</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={12} />
            Yenilə
          </button>
          <a
            href={REPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
          >
            <ExternalLink size={12} />
            Tam ekranda aç
          </a>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden min-h-0">
        <iframe
          src={REPORT_URL}
          className="w-full h-full border-0"
          style={{ minHeight: '600px' }}
          allowFullScreen
          title="ErtAgro Power BI Report"
        />
      </div>
    </div>
  )
}
