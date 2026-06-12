'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Sidebar from './Sidebar'
import Header from './Header'
import ChatPanel from '@/components/chat/ChatPanel'
import MLForecast from '@/components/ml/MLForecast'
import KpiAlertsPage from '@/components/pages/KpiAlertsPage'
import SettingsPage from '@/components/pages/SettingsPage'
import RightPanel from '@/components/filters/RightPanel'
import { useChat } from '@/hooks/useChat'
import { useQueryHistory } from '@/hooks/useQueryHistory'
import type { Filter, QuerySession } from '@/types'

const PAGE_TITLES: Record<string, string> = {
  chat:     'Chatbot - Power BI Assistant',
  forecast: 'ML Proqnoz',
  alerts:   'KPI Monitorinq',
  settings: 'Ayarlar',
}

export default function DashboardLayout() {
  const [activeNav, setActiveNav] = useState('chat')
  const [filters, setFilters] = useState<Filter>({})
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const { messages, sendMessage, loading, error, clearMessages, loadMessages } = useChat()
  const { history, saveSession, clearHistory } = useQueryHistory()

  const pendingQueryRef = useRef<string | null>(null)

  // Persist sidebar collapse state
  useEffect(() => {
    const saved = localStorage.getItem('ertagro_sidebar_collapsed')
    if (saved === 'true') setSidebarCollapsed(true)
  }, [])

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem('ertagro_sidebar_collapsed', String(next))
      return next
    })
  }, [])

  // Save session after AI responds
  useEffect(() => {
    if (!loading && pendingQueryRef.current && messages.length > 0) {
      const last = messages[messages.length - 1]
      if (last.role === 'assistant') {
        saveSession(pendingQueryRef.current, messages)
        pendingQueryRef.current = null
      }
    }
  }, [loading, messages, saveSession])

  const handleSend = useCallback((question: string, filts?: Filter) => {
    pendingQueryRef.current = question
    sendMessage(question, filts ?? filters)
  }, [sendMessage, filters])

  const handleQuestionSelect = useCallback((question: string) => {
    setActiveNav('chat')
    pendingQueryRef.current = question
    sendMessage(question, filters)
  }, [sendMessage, filters])

  const handleSessionClick = useCallback((session: QuerySession) => {
    setActiveNav('chat')
    loadMessages(session.messages)
  }, [loadMessages])

  const handleNewQuery = useCallback(() => { clearMessages() }, [clearMessages])

  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant')

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <div className="hidden lg:flex">
        <Sidebar
          activeNav={activeNav}
          onNavChange={setActiveNav}
          recentSessions={history}
          onSessionClick={handleSessionClick}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
        />
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <Header
          title={PAGE_TITLES[activeNav] || 'AI Chat'}
          onNewQuery={handleNewQuery}
          lastMessage={lastAssistantMsg?.content}
        />

        <div className="flex flex-1 min-h-0">
          <div className="flex flex-col flex-1 min-w-0 min-h-0">

            {activeNav === 'chat' && (
              <ChatPanel
                messages={messages}
                loading={loading}
                error={error}
                onSend={handleSend}
                filters={filters}
                onActionSend={handleQuestionSelect}
              />
            )}

            {activeNav === 'forecast' && (
              <div className="flex flex-col flex-1 min-h-0 overflow-y-auto bg-slate-50 dark:bg-slate-900 p-6">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">ML Proqnoz Modulu</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Parametrləri daxil edib satış proqnozu alın</p>
                </div>
                <MLForecast />
              </div>
            )}

            {activeNav === 'alerts' && <KpiAlertsPage filters={filters} onFiltersChange={setFilters} />}
            {activeNav === 'settings' && (
              <SettingsPage historyCount={history.length} onClearHistory={clearHistory} />
            )}
          </div>

          {/* Right panel — only on alerts page */}
          {activeNav === 'alerts' && (
            <div className="flex flex-shrink-0">
              <button
                onClick={() => setRightPanelOpen(o => !o)}
                className="w-6 bg-slate-50 dark:bg-slate-800 border-l border-slate-100 dark:border-slate-700 flex items-center justify-center hover:bg-brand-50 dark:hover:bg-brand-900/30 hover:text-brand-600 dark:hover:text-brand-400 transition-colors text-slate-400 dark:text-slate-500 flex-shrink-0"
                title={rightPanelOpen ? 'Paneli bağla' : 'Paneli aç'}
              >
                {rightPanelOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              </button>
              <div className={`transition-all duration-300 overflow-hidden ${rightPanelOpen ? 'w-72' : 'w-0'}`}>
                {rightPanelOpen && (
                  <RightPanel
                    filters={filters}
                    onFiltersChange={setFilters}
                    onQuestionSelect={handleQuestionSelect}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
