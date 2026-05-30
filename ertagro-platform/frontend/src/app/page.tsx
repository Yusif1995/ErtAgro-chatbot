'use client'

import { useEffect, useState } from 'react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export default function Home() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
          <p className="text-sm text-gray-500">ErtAgro yüklənir...</p>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <DashboardLayout />
    </ErrorBoundary>
  )
}
