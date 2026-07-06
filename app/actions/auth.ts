'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const ODOO_URL = process.env.ODOO_URL || ''
const ODOO_DB  = process.env.ODOO_DB  || ''

interface LoginResult {
  success: boolean
  error?: string
  uid?: number
  name?: string
}

/**
 * Autentica al usuario contra Odoo usando JSON-RPC.
 * Si tiene éxito, guarda uid, nombre y email en una cookie HTTP-only.
 */
export async function loginWithOdoo(
  email: string,
  password: string
): Promise<LoginResult> {
  if (!ODOO_URL || !ODOO_DB) {
    return { success: false, error: 'El servidor no está configurado correctamente.' }
  }

  try {
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      id: 1,
      params: {
        service: 'common',
        method: 'authenticate',
        args: [ODOO_DB, email, password, {}],
      },
    }

    const res = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })

    if (!res.ok) {
      return { success: false, error: `Error de red: ${res.status}` }
    }

    const data = await res.json()

    if (data.error) {
      return { success: false, error: data.error.data?.message || 'Error de autenticación.' }
    }

    const uid: number | false = data.result

    if (!uid) {
      return { success: false, error: 'Credenciales incorrectas. Verifique su usuario y contraseña de Odoo.' }
    }

    // Obtener nombre del usuario desde Odoo
    let userName = email
    try {
      const namePayload = {
        jsonrpc: '2.0',
        method: 'call',
        id: 2,
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            ODOO_DB,
            uid,
            password,
            'res.users',
            'read',
            [[uid]],
            { fields: ['name'] },
          ],
        },
      }
      const nameRes = await fetch(`${ODOO_URL}/jsonrpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(namePayload),
        cache: 'no-store',
      })
      const nameData = await nameRes.json()
      if (nameData.result?.[0]?.name) {
        userName = nameData.result[0].name
      }
    } catch {
      // Si falla la consulta del nombre, usamos el email
    }

    // Guardar sesión en cookie HTTP-only (segura)
    const session = JSON.stringify({ uid, email })
    const cookieStore = await cookies()
    cookieStore.set('odoo_session', session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8, // 8 horas
      path: '/',
    })

    // Cookie legible por JS para mostrar el nombre en el UI
    cookieStore.set('odoo_user', JSON.stringify({ name: userName, email }), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8,
      path: '/',
    })

    return { success: true, uid, name: userName }
  } catch (err: any) {
    console.error('Error en loginWithOdoo:', err)
    return { success: false, error: 'No se pudo conectar con el servidor de Odoo.' }
  }
}

/**
 * Cierra la sesión borrando la cookie.
 */
export async function logoutFromOdoo(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('odoo_session')
  cookieStore.delete('odoo_user')
  redirect('/login')
}

/**
 * Retorna los datos de la sesión actual, o null si no hay sesión.
 */
export async function getSession(): Promise<{ uid: number; email: string; name: string } | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get('odoo_session')?.value
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
