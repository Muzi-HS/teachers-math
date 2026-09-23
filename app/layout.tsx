import type { Metadata, Viewport } from 'next'
import { AuthProvider } from '@/context/AuthContext'
import InstallBanner from '@/components/InstallBanner'
import SplashScreen from '@/components/SplashScreen'
import './globals.css'

export const metadata: Metadata = {
  title: '티처스 수학학원',
  description: '티처스 수학학원',
  icons: {
    icon: [{ url: '/app-icon-v2-192.png', sizes: '192x192', type: 'image/png' }],
    shortcut: '/app-icon-v2-192.png',
    apple: [{ url: '/apple-touch-icon-v2.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '티처스 수학학원',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta name="theme-color" content="#0D2A5E" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body style={{ margin: 0, padding: 0, overflowX: 'hidden', maxWidth: '100vw' }}>
        <AuthProvider>
          <SplashScreen />
          {children}
        </AuthProvider>
        <InstallBanner />
      </body>
    </html>
  )
}
