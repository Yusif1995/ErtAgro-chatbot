import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ErtAgro – Power BI AI Platform',
  description: 'ErtAgro AI Chat & ML Forecast Platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="az" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme */}
        <script dangerouslySetInnerHTML={{
          __html: `try{var t=localStorage.getItem('ertagro_theme');var p=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if((t||p)==='dark')document.documentElement.classList.add('dark')}catch(e){}`
        }} />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
