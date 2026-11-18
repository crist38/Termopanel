'use server'

import { revalidatePath } from 'next/cache'
import { asc, eq, sql } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'
import { hashPassword, MIN_PASSWORD_LENGTH } from '@/lib/auth/password'
import { isRol, type Rol } from '@/lib/roles'
import { requireRol } from '@/app/actions/auth'

export interface UsuarioListado {
  id: number
  email: string
  nombre: string
  rol: Rol
  activo: boolean
  tienePassword: boolean
  odooUid: number | null
  ultimoAcceso: string | null
}

export interface Resultado {
  ok: boolean
  error?: string
}

export async function listarUsuarios(): Promise<UsuarioListado[]> {
  await requireRol('administracion')
  const filas = await getDb().select().from(schema.usuarios).orderBy(asc(schema.usuarios.nombre))
  return filas.map((u) => ({
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    rol: u.rol,
    activo: u.activo,
    tienePassword: !!u.passwordHash,
    odooUid: u.odooUid,
    ultimoAcceso: u.ultimoAcceso?.toISOString() ?? null,
  }))
}

export async function crearUsuario(input: {
  email: string
  nombre: string
  rol: string
  password: string
}): Promise<Resultado> {
  await requireRol('administracion')
  const email = input.email.trim().toLowerCase()
  const nombre = input.nombre.trim()
  if (!email || !nombre) return { ok: false, error: 'Nombre y email son obligatorios.' }
  if (!isRol(input.rol)) return { ok: false, error: 'Rol no válido.' }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` }
  }

  const db = getDb()
  const [existe] = await db.select({ id: schema.usuarios.id }).from(schema.usuarios)
    .where(sql`lower(${schema.usuarios.email}) = ${email}`).limit(1)
  if (existe) return { ok: false, error: 'Ya existe un usuario con ese email.' }

  await db.insert(schema.usuarios).values({
    email,
    nombre,
    rol: input.rol,
    passwordHash: await hashPassword(input.password),
  })
  revalidatePath('/admin/usuarios')
  return { ok: true }
}

export async function actualizarUsuario(id: number, cambios: {
  nombre?: string
  rol?: string
  activo?: boolean
}): Promise<Resultado> {
  const actual = await requireRol('administracion')
  const set: Partial<typeof schema.usuarios.$inferInsert> = { actualizadoEn: new Date() }

  if (cambios.nombre !== undefined) {
    if (!cambios.nombre.trim()) return { ok: false, error: 'El nombre no puede quedar vacío.' }
    set.nombre = cambios.nombre.trim()
  }
  if (cambios.rol !== undefined) {
    if (!isRol(cambios.rol)) return { ok: false, error: 'Rol no válido.' }
    if (id === actual.uid && cambios.rol !== 'administracion') {
      return { ok: false, error: 'No puede quitarse el rol de Administración a sí mismo.' }
    }
    set.rol = cambios.rol
  }
  if (cambios.activo !== undefined) {
    if (id === actual.uid && !cambios.activo) {
      return { ok: false, error: 'No puede desactivar su propio usuario.' }
    }
    set.activo = cambios.activo
  }

  await getDb().update(schema.usuarios).set(set).where(eq(schema.usuarios.id, id))
  revalidatePath('/admin/usuarios')
  return { ok: true }
}

export async function cambiarPassword(id: number, password: string): Promise<Resultado> {
  await requireRol('administracion')
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` }
  }
  await getDb().update(schema.usuarios)
    .set({ passwordHash: await hashPassword(password), actualizadoEn: new Date() })
    .where(eq(schema.usuarios.id, id))
  revalidatePath('/admin/usuarios')
  return { ok: true }
}
