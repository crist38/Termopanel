"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import Image from 'next/image'
import { loginWithOdoo } from '@/app/actions/auth'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError]       = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const result = await loginWithOdoo(email, password)
      if (result.success) {
        router.replace('/')
      } else {
        setError(result.error || 'Error al iniciar sesión.')
      }
    } catch {
      setError('Error de conexión. Intente nuevamente.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4 font-sans text-slate-800">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div className="relative w-48 h-48">
            <Image
              src="/logo.png"
              alt="PRO WINDOWS"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>

        <div className="w-full h-px bg-slate-200 mb-8" />

        <p className="text-center text-sm text-slate-500 mb-6">
          Ingresa con tu usuario de Odoo
        </p>

        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[15px] text-slate-900 mb-2">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#7a5973] focus:border-[#7a5973] text-[15px] placeholder-slate-400"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-[15px] text-slate-900 mb-2">
              Contraseña
            </label>
            <div className="flex items-stretch border border-slate-300 rounded-md focus-within:ring-1 focus-within:ring-[#7a5973] focus-within:border-[#7a5973] bg-white">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña de Odoo"
                className="w-full px-3 py-2.5 bg-transparent border-none focus:ring-0 outline-none text-[15px] placeholder-slate-400 rounded-l-md"
                required
                autoComplete="current-password"
              />
              <div className="border-l border-slate-300 flex">
                <button
                  type="button"
                  className="px-3 flex items-center hover:bg-slate-50 transition-colors rounded-r-md text-slate-600"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#7a5973] hover:bg-[#6b4c64] text-white py-2.5 rounded-md font-medium transition-colors disabled:opacity-70 text-[15px]"
          >
            {isLoading ? 'Verificando...' : 'Iniciar sesión'}
          </button>
        </form>

        <div className="mt-8 text-center text-xs text-slate-400">
          Conectado a Odoo · ProWindows Ltda.
        </div>
      </div>
    </div>
  )
}
