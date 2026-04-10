import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'Hakari — BTC Analysis',
  description: 'BTC/USDT MTF Analysis Dashboard',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <Script async src="https://www.googletagmanager.com/gtag/js?id=G-XEJY3LK2XB" strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-XEJY3LK2XB');
        `}</Script>
      </head>
      <body>
        <Navbar />
        {children}
      </body>
    </html>
  )
}
