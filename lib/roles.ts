// Roles del sistema y qué secciones puede abrir cada uno.
// Este archivo lo usa también proxy.ts, así que no debe importar la base de datos.

export const ROLES = ['vendedor', 'taller', 'bodega', 'administracion', 'tecnico'] as const
export type Rol = (typeof ROLES)[number]

export const ROL_LABELS: Record<Rol, string> = {
  vendedor: 'Vendedor',
  taller: 'Taller',
  bodega: 'Bodega',
  administracion: 'Administración',
  tecnico: 'Técnico en terreno',
}

export function isRol(value: unknown): value is Rol {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

// Prefijo de ruta → roles que pueden entrar. Administración entra a todo.
// Se usa la primera regla cuyo prefijo coincide, así que las rutas
// específicas van primero y '/' (cotizador de termopaneles) va al final.
const RUTAS: { prefijo: string; roles: Rol[] }[] = [
  { prefijo: '/sin-acceso', roles: ['vendedor', 'taller', 'bodega', 'tecnico'] },
  { prefijo: '/admin', roles: [] },
  { prefijo: '/reports', roles: [] },
  { prefijo: '/fabricacion', roles: ['vendedor', 'taller'] },
  { prefijo: '/corte', roles: ['vendedor', 'taller'] },
  { prefijo: '/reposiciones', roles: ['vendedor', 'tecnico', 'taller'] },
  { prefijo: '/cotizaciones', roles: ['vendedor'] },
  { prefijo: '/monolitico', roles: ['vendedor'] },
  { prefijo: '/formas', roles: ['vendedor'] },
  { prefijo: '/', roles: ['vendedor'] },
]

function coincide(pathname: string, prefijo: string): boolean {
  if (prefijo === '/') return true
  return pathname === prefijo || pathname.startsWith(prefijo + '/')
}

export function puedeAcceder(rol: Rol, pathname: string): boolean {
  if (rol === 'administracion') return true
  const regla = RUTAS.find((r) => coincide(pathname, r.prefijo))
  return regla ? regla.roles.includes(rol) : false
}

/** Primera sección del rol, para redirigir después del login. */
export function inicioPorRol(rol: Rol): string {
  switch (rol) {
    case 'taller': return '/fabricacion'
    case 'tecnico': return '/reposiciones'
    // Bodega todavía no tiene secciones; llegan en los pasos 3 y 4 del plan
    case 'bodega': return '/sin-acceso'
    default: return '/'
  }
}
