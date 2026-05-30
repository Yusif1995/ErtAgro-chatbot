'use client'

import { useState } from 'react'
import { Share2, Plus, Sun, Moon, Check } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'

interface HeaderProps {
  title?: string
  onNewQuery?: () => void
  lastMessage?: string
}

export default function Header({
  title = 'Chatbot - Power BI Assistant',
  onNewQuery,
  lastMessage,
}: HeaderProps) {
  const [copied, setCopied] = useState(false)
  const { isDark, toggleTheme } = useTheme()

  const handleShare = async () => {
    const text = lastMessage
      ? `ErtAgro AI Assistant cavabı:\n\n${lastMessage}\n\n— ${window.location.href}`
      : window.location.href
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <header className="h-14 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
      <div className="flex items-center gap-4">
        <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h1>
        <div className="flex items-center gap-1.5 bg-brand-50 dark:bg-brand-900/30 px-2.5 py-1 rounded-full">
          <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
          <span className="text-xs font-medium text-brand-700 dark:text-brand-400">Online</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
          title="Son cavabı panoya kopyala"
        >
          {copied ? <Check size={14} className="text-brand-600 dark:text-brand-400" /> : <Share2 size={14} />}
          {copied ? 'Kopyalandı!' : 'Paylaş'}
        </button>

        <button
          onClick={onNewQuery}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700 transition-colors shadow-sm"
          title="Söhbəti sıfırla"
        >
          <Plus size={14} />
          Yeni Sorğu
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          title={isDark ? 'Gündüz modu' : 'Gecə modu'}
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  )
}
