'use client'

import { useEffect, useRef } from 'react'
import { Loader2, AlertCircle, MessageSquare, Bot } from 'lucide-react'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import type { Message, Filter } from '@/types'

interface ChatPanelProps {
  messages: Message[]
  loading: boolean
  error: string | null
  onSend: (message: string, filters?: Filter) => void
  filters?: Filter
  onActionSend?: (message: string) => void
}

export default function ChatPanel({
  messages,
  loading,
  error,
  onSend,
  filters = {},
  onActionSend,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleActionSend = (msg: string) => {
    if (onActionSend) onActionSend(msg)
    else onSend(msg, filters)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-slate-900">
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
            <div className="w-16 h-16 rounded-2xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center mb-4">
              <MessageSquare size={28} className="text-brand-600 dark:text-brand-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-2">ErtAgro AI Assistantı</h3>
            <p className="text-sm text-slate-400 dark:text-slate-500 max-w-xs leading-relaxed">Power BI datanız haqqında sual verin</p>
            <div className="mt-5 flex flex-wrap gap-2 justify-center">
              {['Bu ayın ən çox satan 5 məhsul','Kateqoriyalar üzrə ümumi satış','Şəmkir anbarında stoku az olan mallar','Eşqin Qasimovun bu ayki satışı'].map(q => (
                <button key={q} onClick={() => onSend(q, filters)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 hover:text-brand-700 dark:hover:text-brand-400 hover:border-brand-200 dark:hover:border-brand-700 transition-all">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(message => (
          <MessageBubble key={message.id} message={message} onSendMessage={handleActionSend} />
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Bot size={15} className="text-white" />
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-tl-sm shadow-card dark:shadow-none border border-slate-100 dark:border-slate-700 px-4 py-3 flex items-center gap-2">
              <Loader2 size={14} className="text-brand-600 animate-spin" />
              <span className="text-sm text-slate-500 dark:text-slate-400">Cavab hazırlanır...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl text-sm">
            <AlertCircle size={15} />{error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <ChatInput onSend={msg => onSend(msg, filters)} loading={loading} />
    </div>
  )
}
