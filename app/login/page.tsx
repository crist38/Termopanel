"use client"

import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, signInWithPopup, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  // Si ya hay sesión activa, redirigir directo al cotizador
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) router.replace('/');
      else setChecking(false);
    });
    return () => unsub();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace('/');
    } catch (err: any) {
      setError('Credenciales inválidas. Intente nuevamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
      router.replace('/');
    } catch (err: any) {
      setError('Error al iniciar sesión con Google.');
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-[#7a5973] border-t-transparent rounded-full animate-spin" />
      </div>
    );
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

        <div className="w-full h-px bg-slate-200 mb-8"></div>

        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-[15px] text-slate-900">
                Correo electrónico
              </label>
              <a href="#" className="text-[13px] text-[#7a5973] hover:underline">
                Elija un usuario
              </a>
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Escriba su correo"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#7a5973] focus:border-[#7a5973] text-[15px] placeholder-slate-500"
              required
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-[15px] text-slate-900">
                Contraseña
              </label>
              <a href="#" className="text-[13px] text-[#7a5973] hover:underline">
                Restablecer contraseña
              </a>
            </div>
            <div className="flex items-stretch border border-slate-300 rounded-md focus-within:ring-1 focus-within:ring-[#7a5973] focus-within:border-[#7a5973] bg-white">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Escriba su contraseña"
                className="w-full px-3 py-2.5 bg-transparent border-none focus:ring-0 outline-none text-[15px] placeholder-slate-500 rounded-l-md"
                required
              />
              <div className="border-l border-slate-300 flex">
                <button
                  type="button"
                  className="px-3 flex items-center hover:bg-slate-50 transition-colors rounded-r-md text-slate-900"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#7a5973] hover:bg-[#6b4c64] text-white py-2.5 rounded-md font-medium transition-colors disabled:opacity-70 text-[15px]"
            >
              {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 py-2.5 rounded-md font-medium transition-colors text-[15px]"
            >
              <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.7 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.16 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Google
            </button>
          </div>
        </form>

        <div className="mt-6 text-center">
          <a href="#" className="text-[14px] text-[#7a5973] hover:underline">
            ¿No tiene una cuenta?
          </a>
        </div>
      </div>
    </div>
  );
}
