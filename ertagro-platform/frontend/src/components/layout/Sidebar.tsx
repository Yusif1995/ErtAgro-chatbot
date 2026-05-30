'use client'

import {
  MessageSquare, BarChart2, TrendingUp, Bell, Database, Settings,
  Clock, ChevronLeft, ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'
import type { QuerySession } from '@/types'

type NavItem = { id: string; label: string; icon: React.ElementType }

const NAV_ITEMS: NavItem[] = [
  { id: 'chat',     label: 'Chatbot',       icon: MessageSquare },
  { id: 'reports',  label: 'Reports',       icon: BarChart2 },
  { id: 'forecast', label: 'ML Proqnoz',    icon: TrendingUp },
  { id: 'alerts',   label: 'KPI Alerts',    icon: Bell },
  { id: 'sources',  label: 'Data Sources',  icon: Database },
  { id: 'settings', label: 'Settings',      icon: Settings },
]

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'İndicə'
  if (mins < 60) return `${mins} dəq əvvəl`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} saat əvvəl`
  const days = Math.floor(hrs / 24)
  return days === 1 ? 'Dünən' : `${days} gün əvvəl`
}

interface SidebarProps {
  activeNav: string
  onNavChange: (id: string) => void
  onQueryClick?: (query: string) => void
  recentSessions?: QuerySession[]
  onSessionClick?: (session: QuerySession) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

export default function Sidebar({
  activeNav, onNavChange, recentSessions = [],
  onSessionClick, collapsed, onToggleCollapse,
}: SidebarProps) {
  return (
    <aside
      className={clsx(
        'bg-white dark:bg-slate-800 border-r border-slate-100 dark:border-slate-700 flex flex-col h-full shadow-card transition-all duration-300 ease-in-out flex-shrink-0',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className={clsx(
        'border-b border-slate-100 dark:border-slate-700 flex items-center',
        collapsed ? 'p-3 justify-center' : 'p-5 gap-3'
      )}>
        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 shadow-sm border border-slate-100 dark:border-slate-600">
          <img src="/logo.png" alt="ErtAgro" className="w-full h-full object-cover" />
        </div>
        {!collapsed && (
          <div>
            <p className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight">ERT AGRO</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-tight mt-0.5">Healthy heritage</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto overflow-x-hidden">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = activeNav === item.id
            return (
              <li key={item.id}>
                <button
                  onClick={() => onNavChange(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={clsx(
                    'w-full flex items-center rounded-lg text-sm font-medium transition-all',
                    collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                    isActive
                      ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100'
                  )}
                >
                  <Icon
                    size={18}
                    className={clsx(
                      'flex-shrink-0',
                      isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500'
                    )}
                  />
                  {!collapsed && (
                    <>
                      {item.label}
                      {item.id === 'alerts' && (
                        <span className="ml-auto bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                          3
                        </span>
                      )}
                    </>
                  )}
                </button>
              </li>
            )
          })}
        </ul>

        {/* Recent Queries — only when expanded */}
        {!collapsed && recentSessions.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-3 mb-2">
              Son Sorğular
            </p>
            <ul className="space-y-0.5">
              {recentSessions.map((session) => (
                <li key={session.id}>
                  <button
                    onClick={() => onSessionClick?.(session)}
                    className="w-full flex items-start gap-2 px-3 py-2 rounded-lg text-left hover:bg-brand-50 dark:hover:bg-brand-900/30 group transition-colors"
                  >
                    <Clock size={13} className="text-slate-300 dark:text-slate-600 mt-0.5 flex-shrink-0 group-hover:text-brand-400" />
                    <div className="min-w-0">
                      <p className="text-xs text-slate-600 dark:text-slate-400 truncate leading-tight group-hover:text-brand-700 dark:group-hover:text-brand-400">
                        {session.text}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        {formatRelativeTime(session.timestamp)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      {/* Collapse toggle */}
      <div className="px-2 pb-2">
        <button
          onClick={onToggleCollapse}
          className={clsx(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 transition-colors',
            collapsed && 'justify-center'
          )}
          title={collapsed ? 'Genişləndir' : 'Yığ'}
        >
          {collapsed ? <ChevronRight size={15} /> : <><ChevronLeft size={15} /><span>Yığ</span></>}
        </button>
      </div>

      {/* User Profile */}
      {!collapsed && (
        <div className="p-4 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/50 flex items-center justify-center flex-shrink-0">
              <span className="text-brand-700 dark:text-brand-400 font-semibold text-sm">Y</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-tight truncate">Yusif Vahidov</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">Data Analyst</p>
            </div>
          </div>
        </div>
      )}
      {collapsed && (
        <div className="p-3 border-t border-slate-100 dark:border-slate-700 flex justify-center">
          <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/50 flex items-center justify-center">
            <span className="text-brand-700 dark:text-brand-400 font-semibold text-sm">Y</span>
          </div>
        </div>
      )}
    </aside>
  )
}
