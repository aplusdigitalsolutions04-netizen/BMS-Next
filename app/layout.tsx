import type { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'
import { AppProvider } from '@/src/store/AppContext'
import branding from '@/src/config/branding'
import './globals.css'

// favicon: use faviconPath if set, otherwise fall back to logoPath
const iconSrc = branding.faviconPath || branding.logoPath

export const metadata: Metadata = {
  title: branding.appName,
  description: branding.loginBadge,
  ...(iconSrc ? { icons: { icon: iconSrc, shortcut: iconSrc, apple: iconSrc } } : {}),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Favicon — direct link tag (sabse reliable) */}
        {iconSrc && <link rel="icon" href={iconSrc} />}
        {iconSrc && <link rel="shortcut icon" href={iconSrc} />}

        {/* Brand color CSS variables — used throughout the app */}
        <style>{`
          :root {
            --brand:       ${branding.accentColor};
            --brand-dark:  ${branding.accentDark};
            --brand-light: ${branding.accentLight};
          }
        `}</style>
      </head>
      <body>
        <AppProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{ duration: 4000, style: { background: '#333', color: '#fff' } }}
          />
        </AppProvider>
      </body>
    </html>
  )
}
