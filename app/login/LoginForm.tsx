'use client'

import { useActionState, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { login, type LoginState } from '@/app/actions/auth'

const inputClass =
  'w-full px-3 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#7a5973] focus:border-[#7a5973] text-[15px] placeholder-slate-400'

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {})
  const [showPassword, setShowPassword] = useState(false)

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="next" value={next} />
      {state.error && (
        <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">{state.error}</div>
      )}

      <div>
        <label htmlFor="email" className="block text-[15px] text-slate-900 mb-2">Correo electrónico</label>
        <input id="email" name="email" type="email" placeholder="usuario@empresa.com"
          className={inputClass} required autoComplete="username" />
      </div>

      <div>
        <label htmlFor="password" className="block text-[15px] text-slate-900 mb-2">Contraseña</label>
        <div className="flex items-stretch border border-slate-300 rounded-md focus-within:ring-1 focus-within:ring-[#7a5973] focus-within:border-[#7a5973] bg-white">
          <input id="password" name="password" type={showPassword ? 'text' : 'password'}
            className="w-full px-3 py-2.5 bg-transparent border-none focus:ring-0 outline-none text-[15px] rounded-l-md"
            required autoComplete="current-password" />
          <button type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="px-3 flex items-center border-l border-slate-300 hover:bg-slate-50 rounded-r-md text-slate-600"
            onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <button type="submit" disabled={pending}
        className="w-full bg-[#7a5973] hover:bg-[#6b4c64] text-white py-2.5 rounded-md font-medium transition-colors disabled:opacity-70 text-[15px]">
        {pending ? 'Verificando...' : 'Iniciar sesión'}
      </button>
    </form>
  )
}
