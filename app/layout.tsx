export const metadata = {
  title: 'Cotizador Termopaneles',
  description: 'Cotizador de termopaneles',
}

import Script from 'next/script'
import { Navbar } from './components/Navbar'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
      </head>
      <body suppressHydrationWarning className="bg-slate-50 min-h-screen">
        <Navbar />
        {children}
      </body>
    </html>
  )
}
