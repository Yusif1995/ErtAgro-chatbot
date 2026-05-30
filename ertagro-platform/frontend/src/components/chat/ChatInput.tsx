'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import { Send, Loader2 } from 'lucide-react'

interface ChatInputProps {
  onSend: (message: string) => void
  loading?: boolean
}

export default function ChatInput({ onSend, loading = false }: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || loading) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = () => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 px-4 py-3">
      <div className="flex items-end gap-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600 px-4 py-3 focus-within:border-brand-300 dark:focus-within:border-brand-600 focus-within:bg-white dark:focus-within:bg-slate-700 transition-all shadow-sm">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Sualınızı yazın..."
          rows={1}
          className="flex-1 bg-transparent resize-none text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 outline-none leading-relaxed max-h-32"
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={!value.trim() || loading}
          className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          {loading ? <Loader2 size={16} className="text-white animate-spin" /> : <Send size={15} className="text-white" />}
        </button>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-center">
        Power BI məlumatlarınıza əsaslanan AI cavablar
      </p>
    </div>
  )
}
