'use client'

import React from 'react'

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-red-50 p-8">
          <div className="max-w-2xl w-full bg-white rounded-2xl shadow-lg p-6 border border-red-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <span className="text-red-600 text-xl">⚠</span>
              </div>
              <h2 className="text-lg font-bold text-red-700">Xəta baş verdi</h2>
            </div>
            <div className="bg-red-50 rounded-xl p-4 font-mono text-sm text-red-800 break-all">
              <p className="font-semibold mb-1">
                {this.state.error?.name}: {this.state.error?.message}
              </p>
              <pre className="text-xs text-red-600 whitespace-pre-wrap mt-2">
                {this.state.error?.stack?.split('\n').slice(0, 8).join('\n')}
              </pre>
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
            >
              Yenidən cəhd et
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
