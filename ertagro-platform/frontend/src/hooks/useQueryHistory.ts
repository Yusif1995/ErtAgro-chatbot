'use client'

import { useState, useCallback, useEffect } from 'react'
import type { Message, QuerySession } from '@/types'

const STORAGE_KEY = 'ertagro_query_history'
const MAX_ENTRIES = 20

export function useQueryHistory() {
  const [history, setHistory] = useState<QuerySession[]>([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setHistory(JSON.parse(stored))
    } catch {}
  }, [])

  const saveSession = useCallback((text: string, messages: Message[]) => {
    if (!text.trim() || messages.length === 0) return
    const session: QuerySession = {
      id: `session-${Date.now()}`,
      text,
      timestamp: new Date().toISOString(),
      messages,
    }
    setHistory(prev => {
      // dedupe by text (same question updates rather than duplicates)
      const updated = [session, ...prev.filter(s => s.text !== text)].slice(0, MAX_ENTRIES)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      } catch {}
      return updated
    })
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }, [])

  return { history, saveSession, clearHistory }
}

export function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'İndicə'
  if (mins < 60) return `${mins} dəq əvvəl`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} saat əvvəl`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Dünən'
  return `${days} gün əvvəl`
}
