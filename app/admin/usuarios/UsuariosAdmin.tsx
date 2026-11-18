'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, KeyRound } from 'lucide-react'
import {
  actualizarUsuario, cambiarPassword, crearUsuario,
  type Resultado, type UsuarioListado,
} from '@/app/actions/usuarios'
import { ROLES, ROL_LABELS } from '@/lib/roles'

const input = 'px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#7a5973] focus:border-[#7a5973]'
const boton = 'inline-flex items-center gap-2 bg-[#7a5973] hover:bg-[#6b4c64] text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-60'

export function UsuariosAdmin({ usuarios, miId }: { usuarios: UsuarioListado[]; miId: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [nuevo, setNuevo] = useState({ nombre: '', email: '', rol: 'vendedor', password: '' })

  const ejecutar = (accion: () => Promise<Resultado>, textoOk: string, alTerminar?: () => void) => {
    startTransition(async () => {
      try {
        const r = await accion()
        if (r.ok) {
          setMensaje({ tipo: 'ok', texto: textoOk })
          alTerminar?.()
          router.refresh()
        } else {
          setMensaje({ tipo: 'error', texto: r.error ?? 'No se pudo guardar.' })
        }
      } catch (err) {
        setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'Error inesperado.' })
      }
    })
  }

  const pedirPassword = (u: UsuarioListado) => {
    const pw = window.prompt(`Nueva contraseña para ${u.nombre} (mínimo 8 caracteres):`)
    if (pw) ejecutar(() => cambiarPassword(u.id, pw), `Contraseña de ${u.nombre} actualizada.`)
  }

  return (
    <div className="space-y-6">
      {mensaje && (
        <div className={`text-sm p-3 rounded ${mensaje.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {mensaje.texto}
        </div>
      )}

      <form
        className="bg-white rounded-lg shadow-sm p-4 grid gap-3 sm:grid-cols-5 items-end"
        onSubmit={(e) => {
          e.preventDefault()
          ejecutar(() => crearUsuario(nuevo), `Usuario ${nuevo.nombre} creado.`,
            () => setNuevo({ nombre: '', email: '', rol: 'vendedor', password: '' }))
        }}
      >
        <label className="text-xs text-slate-600 flex flex-col gap-1">Nombre
          <input className={input} required value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
        </label>
        <label className="text-xs text-slate-600 flex flex-col gap-1">Email
          <input className={input} type="email" required value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} />
        </label>
        <label className="text-xs text-slate-600 flex flex-col gap-1">Rol
          <select className={input} value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{ROL_LABELS[r]}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-600 flex flex-col gap-1">Contraseña inicial
          <input className={input} type="password" minLength={8} required autoComplete="new-password"
            value={nuevo.password} onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })} />
        </label>
        <button type="submit" className={boton} disabled={pending}><UserPlus size={16} /> Crear usuario</button>
      </form>

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Rol</th>
              <th className="px-4 py-2 font-medium">Activo</th>
              <th className="px-4 py-2 font-medium">Último acceso</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  {u.nombre}
                  {!u.tienePassword && <span className="ml-2 text-xs text-amber-600">sin contraseña</span>}
                </td>
                <td className="px-4 py-2 text-slate-600">{u.email}</td>
                <td className="px-4 py-2">
                  <select className={input} value={u.rol} disabled={pending || u.id === miId}
                    onChange={(e) => ejecutar(() => actualizarUsuario(u.id, { rol: e.target.value }), `Rol de ${u.nombre} actualizado.`)}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROL_LABELS[r]}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input type="checkbox" checked={u.activo} disabled={pending || u.id === miId}
                    onChange={(e) => ejecutar(() => actualizarUsuario(u.id, { activo: e.target.checked }),
                      `${u.nombre} ${e.target.checked ? 'activado' : 'desactivado'}.`)} />
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {u.ultimoAcceso ? new Date(u.ultimoAcceso).toLocaleString('es-CL') : 'Nunca'}
                </td>
                <td className="px-4 py-2 text-right">
                  <button type="button" onClick={() => pedirPassword(u)} disabled={pending}
                    className="inline-flex items-center gap-1 text-[#7a5973] hover:underline text-sm">
                    <KeyRound size={14} /> Contraseña
                  </button>
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No hay usuarios.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
