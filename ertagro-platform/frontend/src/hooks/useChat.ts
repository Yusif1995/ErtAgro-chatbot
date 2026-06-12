'use client'

import { useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { Message, Filter, ChatResponse } from '@/types'

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendMessage = useCallback(async (question: string, filters: Filter = {}) => {
    if (!question.trim()) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    }

    const history = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      dax: msg.chatResponse?.dax
    }))

    setMessages(prev => [...prev, userMessage])
    setLoading(true)
    setError(null)

    try {
      const response: ChatResponse = await api.chat({ question, filters, history })

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.answer || 'Cavab alındı.',
        timestamp: response.timestamp || new Date().toISOString(),
        chatResponse: response,
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cavab alına bilmədi.')
    } finally {
      setLoading(false)
    }
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  const loadMessages = useCallback((msgs: Message[]) => {
    setMessages(msgs)
    setError(null)
  }, [])

  return { messages, sendMessage, loading, error, clearMessages, loadMessages }
}
