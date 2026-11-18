'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'
import { verifyPassword } from '@/lib/auth/password'
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE, verifySessionToken, type SessionData } from '@/lib/session'
import { inicioPorRol, type Rol } from '@/lib/roles'

export interface LoginState {
  error?: string
}

/**
 * Inicia sesión con el email y la contraseña guardados en la base propia.
 * Se usa desde el formulario de /login con useActionState.
 */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '')

  if (!email || !password) return { error: 'Ingrese su email y contraseña.' }

  let usuario: schema.Usuario | undefined
  try {
    const db = getDb()
    ;[usuario] = await db.select().from(schema.usuarios)
      .where(sql`lower(${schema.usuarios.email}) = ${email}`).limit(1)
  } catch (err) {
    console.error('Error al leer el usuario:', err)
    return { error: 'No se pudo conectar con la base de datos.' }
  }

  // Mismo mensaje para usuario inexistente, inactivo o contraseña errónea
  const ok = usuario?.activo && await verifyPassword(password, usuario.passwordHash)
  if (!usuario || !ok) return { error: 'Email o contraseña incorrectos.' }

  const token = await createSessionToken({
    uid: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol,
    odooUid: usuario.odooUid,
  })
  if (!token) {
    console.error('Falta SESSION_SECRET o tiene menos de 32 caracteres')
    return { error: 'El servidor no está configurado correctamente.' }
  }

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })

  await getDb().update(schema.usuarios)
    .set({ ultimoAcceso: new Date() })
    .where(eq(schema.usuarios.id, usuario.id))

  // Solo rutas internas, para no redirigir a otro sitio
  const destino = next.startsWith('/') && !next.startsWith('//') ? next : inicioPorRol(usuario.rol)
  redirect(destino)
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
  redirect('/login')
}

/**
 * Usuario de la sesión actual, o null. Revisa en la base que siga activo,
 * para que desactivar a alguien corte su acceso sin esperar a que expire la sesión.
 */
export async function getCurrentUser(): Promise<SessionData | null> {
  const cookieStore = await cookies()
  const session = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value)
  if (!session) return null
  const [usuario] = await getDb().select({ activo: schema.usuarios.activo, rol: schema.usuarios.rol })
    .from(schema.usuarios).where(eq(schema.usuarios.id, session.uid)).limit(1)
  if (!usuario?.activo) return null
  return { ...session, rol: usuario.rol }
}

/** Igual que getCurrentUser, pero exige uno de los roles indicados (Administración siempre pasa). */
export async function requireRol(...roles: Rol[]): Promise<SessionData> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Sesión expirada. Vuelva a iniciar sesión.')
  if (user.rol !== 'administracion' && !roles.includes(user.rol)) {
    throw new Error('No tiene permiso para esta acción.')
  }
  return user
}

/**
 * Sesión para las acciones que todavía escriben en Odoo: devuelve el usuario
 * de Odoo asociado. Si el usuario no está vinculado a Odoo, retorna null y
 * esas acciones siguen cerradas, igual que antes.
 */
export async function getSession(): Promise<{ uid: number; email: string } | null> {
  const user = await getCurrentUser()
  if (!user || user.odooUid === null) return null
  return { uid: user.odooUid, email: user.email }
}
