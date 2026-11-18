import { listarUsuarios } from '@/app/actions/usuarios'
import { getCurrentUser } from '@/app/actions/auth'
import { UsuariosAdmin } from './UsuariosAdmin'

export const metadata = { title: 'Usuarios · PRO WINDOWS' }
export const dynamic = 'force-dynamic'

export default async function UsuariosPage() {
  const [usuarios, actual] = await Promise.all([listarUsuarios(), getCurrentUser()])
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-slate-800 mb-1">Usuarios</h1>
      <p className="text-sm text-slate-500 mb-6">
        Crea las cuentas del equipo, asigna su rol y restablece contraseñas.
      </p>
      <UsuariosAdmin usuarios={usuarios} miId={actual?.uid ?? 0} />
    </div>
  )
}
