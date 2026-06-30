"use client"

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, Layers, Square, FileText, Triangle, BarChart2 } from 'lucide-react';


export function Navbar() {
  const pathname = usePathname();

  // Ocultar en la pantalla de login
  if (pathname === '/login') return null;

  return (
    <nav className="bg-[#7a5973] text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <div className="flex-shrink-0 flex items-center">
              <img src="/logo-texto.png" alt="PRO WINDOWS" className="h-7 sm:h-8 object-contain bg-white/95 px-2 py-1 rounded shadow-sm" />
            </div>
            <div className="hidden md:block">
              <div className="flex items-baseline space-x-2">
                <Link
                  href="/"
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    pathname === '/' 
                      ? 'bg-[#6b4c64] text-white shadow-inner' 
                      : 'text-white/80 hover:bg-[#8f6b88] hover:text-white'
                  }`}
                >
                  <Layers size={16} />
                  Termopaneles
                </Link>
                <Link
                  href="/monolitico"
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    pathname === '/monolitico' 
                      ? 'bg-[#6b4c64] text-white shadow-inner' 
                      : 'text-white/80 hover:bg-[#8f6b88] hover:text-white'
                  }`}
                >
                  <Square size={16} />
                  Corte Vidrio Monolítico
                </Link>
                <Link
                  href="/formas"
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    pathname === '/formas' 
                      ? 'bg-[#6b4c64] text-white shadow-inner' 
                      : 'text-white/80 hover:bg-[#8f6b88] hover:text-white'
                  }`}
                >
                  <Triangle size={16} />
                  Formas
                </Link>
                <Link
                  href="/cotizaciones"
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    pathname === '/cotizaciones' 
                      ? 'bg-[#6b4c64] text-white shadow-inner' 
                      : 'text-white/80 hover:bg-[#8f6b88] hover:text-white'
                  }`}
                >
                  <FileText size={16} />
                  Cotizaciones
                </Link>
                <Link
                  href="/reports"
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    pathname === '/reports' 
                      ? 'bg-[#6b4c64] text-white shadow-inner' 
                      : 'text-white/80 hover:bg-[#8f6b88] hover:text-white'
                  }`}
                >
                  <BarChart2 size={16} />
                  Reportes
                </Link>

              </div>
            </div>
          </div>
          <div>
            <Link
              href="/admin/config"
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                pathname === '/admin/config' 
                  ? 'bg-[#6b4c64] text-white shadow-inner' 
                  : 'text-white/80 hover:bg-[#8f6b88] hover:text-white'
              }`}
            >
              <Settings size={16} />
              Configuración
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
