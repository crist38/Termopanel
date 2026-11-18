export const metadata = {
  title: 'Cotizador Termopaneles',
  description: 'Cotizador de termopaneles',
}

import Script from 'next/script'
import { cookies } from 'next/headers'
import { Navbar } from './components/Navbar'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session'

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value)
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
        <style dangerouslySetInnerHTML={{__html: `
          input[type="number"]::-webkit-inner-spin-button,
          input[type="number"]::-webkit-outer-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          input[type="number"] {
            -moz-appearance: textfield;
          }
        `}} />
      </head>
      <body suppressHydrationWarning className="bg-slate-50 min-h-screen">
        {session && <Navbar usuario={{ nombre: session.nombre, rol: session.rol }} />}
        {children}
      </body>
    </html>
  )
}
