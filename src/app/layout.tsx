import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { PWAInit } from '@/components/pwa/pwa-init'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const viewport: Viewport = {
  themeColor: '#F97316',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Mocciaro Soft V001 | Sistema de Gestión Integral',
  description: 'Mocciaro Soft V001 — ERP/CRM multi-empresa con IA. Cotizador, CRM, Stock, SAT.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mocciaro V001',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'msapplication-TileColor': '#0B0E13',
    'msapplication-TileImage': '/icons/icon-144.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Splash screens iOS */}
        <link
          rel="apple-touch-startup-image"
          href="/icons/icon-512.png"
        />
        {/* Apariencia bootstrap — aplica tema, tamaño de texto y accent
            antes del primer paint para evitar FOUC. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;d.setAttribute('data-theme','light');try{localStorage.setItem('theme','light');}catch(_){}var s=localStorage.getItem('textSize');if(['sm','normal','lg','xl'].indexOf(s)<0)s='normal';d.setAttribute('data-text-size',s);d.setAttribute('data-accent','orange');try{localStorage.setItem('accent','orange');}catch(_){}}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-[#F2F2F2] text-[#1F2937] antialiased">
        {children}
        {/* Registro del Service Worker y componentes PWA globales */}
        <PWAInit />
      </body>
    </html>
  )
}
