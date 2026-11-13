'use server'

import { cookies } from 'next/headers'
import { verifySessionToken } from '@/lib/session'

/**
 * Retorna los datos de la sesión actual, o null si no hay sesión.
 * La pantalla de login se quitó, así que hoy no se crean sesiones nuevas:
 * las acciones que escriben en Odoo siguen cerradas hasta que vuelva el login.
 */
export async function getSession(): Promise<{ uid: number; email: string } | null> {
  const cookieStore = await cookies()
  return verifySessionToken(cookieStore.get('odoo_session')?.value)
}
