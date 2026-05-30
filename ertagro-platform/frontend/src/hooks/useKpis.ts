'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { KPI } from '@/types'

export function useKpis() {
  const [kpis, setKpis] = useState<KPI[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchKpis = async () => {
      try {
        setLoading(true)
        const data = await api.getKpis()
        setKpis(data)
      } catch (err) {
        setError('KPI məlumatları yüklənə bilmədi')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchKpis()
  }, [])

  return { kpis, loading, error }
}
