'use client'

import { useState, useCallback, useEffect } from 'react'

type Theme = 'light' | 'dark'

function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark')
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const saved = localStorage.getItem('ertagro_theme') as Theme | null
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    const initial = saved ?? preferred
    setTheme(initial)
    applyTheme(initial)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light'
      localStorage.setItem('ertagro_theme', next)
      applyTheme(next)
      return next
    })
  }, [])

  return { theme, toggleTheme, isDark: theme === 'dark' }
}
