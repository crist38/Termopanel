"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import Image from 'next/image'
import { loginWithOdoo } from '@/app/actions/auth'

interface VendedorRecordado {
  name: string
  email: string
  avatar?: string
}

const LAST_USER_KEY = 'odoo_last_user'

function AvatarVendedor({ vendedor }: { vendedor: VendedorRecordado }) {
  const iniciales = vendedor.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

  return (
    <div className="flex flex-col items-center mb-6">
      {vendedor.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={vendedor.avatar}
          alt={vendedor.name}
          className="w-20 h-20 rounded-full object-cover border border-slate-200 shadow-sm"
        />
      ) : (
        <div className="w-20 h-20 rounded-full bg-[#7a5973] text-white flex items-center justify-center text-2xl font-semibold shadow-sm">
          {iniciales || '?'}
        </div>
      )}
      <p className="mt-3 text-base font-semibold text-slate-900 text-center">{vendedor.name}</p>
      <p className="text-sm text-slate-500 text-center">{vendedor.email}</p>
    </div>
  )
}

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError]       = useState('')
  const [isLoading, setIsLoading] = useState(false)
  // Último vendedor que inició sesión en este dispositivo
  const [vendedor, setVendedor] = useState<VendedorRecordado | null>(null)
  const [bienvenida, setBienvenida] = useState(false)
  const router = useRouter()

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_USER_KEY)
      if (!raw) return
      const guardado: VendedorRecordado = JSON.parse(raw)
      if (guardado?.name && guardado?.email) {
        setVendedor(guardado)
        setEmail(guardado.email)
      }
    } catch {}
  }, [])

  const handleOtraCuenta = () => {
    localStorage.removeItem(LAST_USER_KEY)
    setVendedor(null)
    setEmail('')
    setPassword('')
    setError('')
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const result = await loginWithOdoo(email, password)
      if (result.success) {
        const actual: VendedorRecordado = { name: result.name || email, email, avatar: result.avatar }
        try {
          localStorage.setItem(LAST_USER_KEY, JSON.stringify(actual))
        } catch {}
        setVendedor(actual)
        setBienvenida(true)
        // Pausa breve para que se alcance a ver quién ingresó
        setTimeout(() => router.replace('/'), 1200)
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

        {vendedor ? (
          <AvatarVendedor vendedor={vendedor} />
        ) : (
          <p className="text-center text-sm text-slate-500 mb-6">
            Ingresa con tu usuario de Odoo
          </p>
        )}

        {bienvenida ? (
          <p className="text-center text-sm text-slate-500">Bienvenido, ingresando...</p>
        ) : (
        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          <div className={vendedor ? 'hidden' : ''}>
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

          {vendedor && (
            <button
              type="button"
              onClick={handleOtraCuenta}
              className="w-full text-center text-sm text-[#7a5973] hover:underline"
            >
              Usar otra cuenta
            </button>
          )}
        </form>
        )}

        <div className="mt-8 text-center text-xs text-slate-400">
          Conectado a Odoo · ProWindows Ltda.
        </div>
      </div>
    </div>
  )
}
