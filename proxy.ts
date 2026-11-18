import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session'
import { inicioPorRol, puedeAcceder } from '@/lib/roles'

// Exige sesión en toda la app y bloquea las secciones que el rol no puede abrir.
// Las acciones del servidor revisan permisos por su cuenta (requireRol),
// esto solo evita mostrar páginas a quien no corresponde.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (pathname === '/login') return NextResponse.next()

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)
  if (!session) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`
    const res = NextResponse.redirect(url)
    res.cookies.delete(SESSION_COOKIE)
    return res
  }

  if (!puedeAcceder(session.rol, pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = inicioPorRol(session.rol)
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Todo menos archivos estáticos e imágenes
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)',
  ],
}
