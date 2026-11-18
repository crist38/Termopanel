import { LoginForm } from './LoginForm'

export const metadata = { title: 'Iniciar sesión · PRO WINDOWS' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4 font-sans text-slate-800">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <img src="/logo.png" alt="PRO WINDOWS" className="w-48 h-48 object-contain" />
        </div>
        <div className="w-full h-px bg-slate-200 mb-8" />
        <p className="text-center text-sm text-slate-500 mb-6">Ingresa con tu usuario</p>
        <LoginForm next={next ?? ''} />
        <div className="mt-8 text-center text-xs text-slate-400">ProWindows Ltda.</div>
      </div>
    </div>
  )
}
