import type { Metadata } from 'next'
import { AuthProvider } from '@/context/AuthContext'

export const metadata: Metadata = {
  title: '티처스 수학학원',
  description: '티처스 수학학원',
  icons: {
    icon: [
      { url: '/logo.png', type: 'image/png' },
    ],
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '티처스 수학학원',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta name="theme-color" content="#0D2A5E" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}