'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import { Send, Loader2, Mic, MicOff } from 'lucide-react'

interface ChatInputProps {
  onSend: (message: string) => void
  loading?: boolean
}

export default function ChatInput({ onSend, loading = false }: ChatInputProps) {
  const [value, setValue] = useState('')
  const [recording, setRecording] = useState(false)
  const [sttLoading, setSttLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setSttLoading(true)
        try {
          const form = new FormData()
          form.append('audio', blob, 'audio.webm')
          const r = await fetch('/api/stt', { method: 'POST', body: form })
          const data = await r.json()
          if (data.text) {
            setValue(prev => prev ? prev + ' ' + data.text : data.text)
          }
        } catch {}
        setSttLoading(false)
      }

      mediaRecorder.start()
      setRecording(true)
    } catch {
      alert('Mikrofona giriş icazəsi verilmədi')
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
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
          placeholder={recording ? 'Danışın... (saxlamaq üçün düyməyə basın)' : 'Sualınızı yazın...'}
          rows={1}
          className="flex-1 bg-transparent resize-none text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 outline-none leading-relaxed max-h-32"
          disabled={loading || recording}
        />
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={loading || sttLoading}
          title={recording ? 'Saxla' : 'Səslə sual ver'}
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${
            recording
              ? 'bg-red-500 hover:bg-red-600 animate-pulse'
              : 'bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500'
          }`}
        >
          {sttLoading
            ? <Loader2 size={16} className="text-slate-600 dark:text-slate-300 animate-spin" />
            : recording
              ? <MicOff size={15} className="text-white" />
              : <Mic size={15} className="text-slate-600 dark:text-slate-300" />
          }
        </button>
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
