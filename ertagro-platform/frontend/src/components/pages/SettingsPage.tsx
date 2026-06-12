'use client'

import { useState, useEffect } from 'react'
import {
  Database,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  RefreshCw,
  Shield,
} from 'lucide-react'
import { api } from '@/lib/api'

interface SqlDb {
  name: string
  server: string
  database: string
}

interface ConnectionStatus {
  status: 'idle' | 'testing' | 'ok' | 'error'
  message?: string
}

interface SettingsPageProps {
  historyCount: number
  onClearHistory: () => void
}

export default function SettingsPage({ historyCount, onClearHistory }: SettingsPageProps) {
  const [databases, setDatabases] = useState<SqlDb[]>([])
  const [connStatus, setConnStatus] = useState<Record<string, ConnectionStatus>>({})
  const [historyCleared, setHistoryCleared] = useState(false)

  useEffect(() => {
    api.getSqlDatabases()
      .then((d) => setDatabases(d.databases ?? []))
      .catch(() => {})
  }, [])

  const testConnection = async (db: SqlDb) => {
    setConnStatus(prev => ({ ...prev, [db.name]: { status: 'testing' } }))
    try {
      const result = await api.testSqlConnection(db.server, db.database)
      setConnStatus(prev => ({
        ...prev,
        [db.name]: { status: result.success ? 'ok' : 'error', message: result.message },
      }))
    } catch {
      setConnStatus(prev => ({
        ...prev,
        [db.name]: { status: 'error', message: 'Bağlantı alınmadı' },
      }))
    }
  }

  const handleClearHistory = () => {
    onClearHistory()
    setHistoryCleared(true)
    setTimeout(() => setHistoryCleared(false), 3000)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900 p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* SQL Connections */}
        <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50 dark:border-slate-700 flex items-center gap-2">
            <Database size={16} className="text-brand-600" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">SQL Bağlantıları</h2>
            <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">Microsoft Fabric SQL</span>
          </div>
          <div className="divide-y divide-slate-50">
            {databases.length === 0 && (
              <p className="px-5 py-4 text-sm text-slate-400">Yüklənir...</p>
            )}
            {databases.map((db) => {
              const st = connStatus[db.name]
              return (
                <div key={db.name} className="px-5 py-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{db.name}</p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{db.database}</p>
                    {st?.message && (
                      <p className={`text-xs mt-1 ${st.status === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
                        {st.message}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {st?.status === 'ok' && <CheckCircle2 size={16} className="text-green-500" />}
                    {st?.status === 'error' && <XCircle size={16} className="text-red-400" />}
                    <button
                      onClick={() => testConnection(db)}
                      disabled={st?.status === 'testing'}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 text-xs font-medium hover:bg-brand-100 transition-colors disabled:opacity-50"
                    >
                      {st?.status === 'testing'
                        ? <><Loader2 size={12} className="animate-spin" /> Test edilir...</>
                        : <><RefreshCw size={12} /> Test et</>
                      }
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Chat History */}
        <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50 dark:border-slate-700 flex items-center gap-2">
            <Clock size={16} className="text-brand-600" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sorğu Tarixçəsi</h2>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Yadda saxlanmış sorğu:{' '}
                  <span className="font-semibold text-slate-800">{historyCount}</span>
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Brauzer yaddaşında saxlanılır (localStorage)
                </p>
              </div>
              <button
                onClick={handleClearHistory}
                disabled={historyCount === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 size={13} />
                {historyCleared ? 'Silindi!' : 'Tarixçəni sil'}
              </button>
            </div>
          </div>
        </section>

        {/* Security / Info */}
        <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50 dark:border-slate-700 flex items-center gap-2">
            <Shield size={16} className="text-brand-600" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Təhlükəsizlik</h2>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-3 bg-green-50 rounded-xl p-3">
              <CheckCircle2 size={15} className="text-green-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-green-700">Azure AD Autentifikasiya</p>
                <p className="text-xs text-green-600 mt-0.5">Service Principal aktiv</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-green-50 rounded-xl p-3">
              <CheckCircle2 size={15} className="text-green-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-green-700">Microsoft Graph API</p>
                <p className="text-xs text-green-600 mt-0.5">Email göndərişi aktiv (Mail.Send)</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-green-50 rounded-xl p-3">
              <CheckCircle2 size={15} className="text-green-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-green-700">HTTPS</p>
                <p className="text-xs text-green-600 mt-0.5">Azure App Service SSL aktiv</p>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
