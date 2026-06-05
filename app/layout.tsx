export const metadata = {
  title: 'Cotizador Termopaneles',
  description: 'Cotizador de termopaneles',
}

import { Navbar } from './components/Navbar'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Agregamos Tailwind via CDN temporalmente para que los estilos funcionen hasta que lo configures */}
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body suppressHydrationWarning className="bg-slate-50 min-h-screen">
        <Navbar />
        {children}
      </body>
    </html>
  )
}
