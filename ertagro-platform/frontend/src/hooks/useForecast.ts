'use client'

import { useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { ForecastRequest, ForecastResponse } from '@/types'

export function useForecast() {
  const [result, setResult] = useState<ForecastResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getForecast = useCallback(async (request: ForecastRequest) => {
    setLoading(true)
    setError(null)

    try {
      const data: ForecastResponse = await api.forecast(request)
      setResult(data)
    } catch (err) {
      setError('Proqnoz alına bilmədi. Zəhmət olmasa yenidən cəhd edin.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return { result, loading, error, getForecast, reset }
}
