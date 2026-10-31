import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/session'

const PUBLIC_PATHS = ['/login']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rutas públicas siempre accesibles
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const session = request.cookies.get('odoo_session')?.value

  if (!session) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Validar la firma y la expiración de la sesión
  if (!(await verifySessionToken(session))) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    const res = NextResponse.redirect(loginUrl)
    res.cookies.delete('odoo_session')
    return res
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Aplica a todas las rutas excepto:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico
     * - public assets (logo, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.png$|.*\\.ico$).*)',
  ],
}
