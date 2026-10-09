"use client"

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, Layers, Square, FileText, Triangle, BarChart2, Menu, X, LogOut } from 'lucide-react';
import { logoutFromOdoo } from '@/app/actions/auth';

interface Vendedor {
  name: string;
  email?: string;
  avatar?: string;
}

function AvatarVendedor({ vendedor, size }: { vendedor: Vendedor; size: string }) {
  const iniciales = vendedor.name
    .split(/[ ]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  if (vendedor.avatar) {
    return <img src={vendedor.avatar} alt={vendedor.name} className={`${size} rounded-full object-cover border border-white/40 shrink-0`} />;
  }
  return (
    <div className={`${size} rounded-full bg-white/20 border border-white/40 flex items-center justify-center text-xs font-semibold shrink-0`}>
      {iniciales || '?'}
    </div>
  );
}

// Avatar del vendedor; al tocarlo abre un menú con sus datos y la opción de cerrar sesión
function MenuVendedor({ vendedor, nombreClassName }: { vendedor: Vendedor; nombreClassName: string }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('pointerdown', cerrar);
    return () => document.removeEventListener('pointerdown', cerrar);
  }, [abierto]);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className="flex items-center gap-2 min-w-0 rounded-md px-1.5 py-1 hover:bg-[#8f6b88] transition-colors"
        aria-haspopup="menu"
        aria-expanded={abierto}
        title={vendedor.name}
      >
        <AvatarVendedor vendedor={vendedor} size="w-8 h-8" />
        <span className={nombreClassName}>{vendedor.name}</span>
      </button>

      {abierto && (
        <div className="absolute right-0 top-full mt-2 w-60 bg-white text-slate-800 rounded-lg shadow-lg border border-slate-200 overflow-hidden z-50" role="menu">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold truncate">{vendedor.name}</p>
            {vendedor.email && <p className="text-xs text-slate-500 truncate">{vendedor.email}</p>}
          </div>
          <form action={logoutFromOdoo}>
            <button
              type="submit"
              role="menuitem"
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={16} /> Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [vendedor, setVendedor] = useState<Vendedor | null>(null);

  // Vendedor con sesión iniciada: nombre desde la cookie y foto guardada al hacer login
  useEffect(() => {
    if (pathname === '/login') {
      setVendedor(null);
      return;
    }
    const cookieVal = document.cookie
      .split('; ')
      .find((r) => r.startsWith('odoo_user='))
      ?.split('=')
      .slice(1)
      .join('=');
    if (!cookieVal) return;
    try {
      const sesion = JSON.parse(decodeURIComponent(cookieVal));
      const name: string = sesion.name || sesion.email || '';
      if (!name) return;
      let avatar: string | undefined;
      try {
        const guardado = JSON.parse(localStorage.getItem('odoo_last_user') || 'null');
        if (guardado?.email === sesion.email) avatar = guardado.avatar;
      } catch {}
      setVendedor({ name, email: sesion.email, avatar });
    } catch {}
  }, [pathname]);

  // Ocultar en la pantalla de login
  if (pathname === '/login') return null;

  const navItems = [
    { href: '/', label: 'Termopaneles', icon: Layers },
    { href: '/monolitico', label: 'Corte Vidrio Monolítico', icon: Square },
    { href: '/formas', label: 'Formas', icon: Triangle },
    { href: '/cotizaciones', label: 'Cotizaciones', icon: FileText },
    { href: '/reports', label: 'Reportes', icon: BarChart2 },
    { href: '/admin/config', label: 'Configuración', icon: Settings },
  ];

  return (
    <nav className="bg-[#7a5973] text-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex-shrink-0 flex items-center">
              <img src="/logo-texto.png" alt="PRO WINDOWS" className="h-7 sm:h-8 object-contain bg-white/95 px-2 py-1 rounded shadow-sm" />
            </div>
            
            {/* Botón menú hamburguesa en móvil */}
            {vendedor && (
              <div className="md:hidden ml-auto mr-1 min-w-0">
                <MenuVendedor vendedor={vendedor} nombreClassName="text-xs font-medium text-white/90 truncate max-w-[9rem]" />
              </div>
            )}

            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              type="button"
              className="md:hidden inline-flex items-center justify-center p-2 rounded-md text-white/80 hover:text-white hover:bg-[#8f6b88] focus:outline-none transition-colors"
              aria-controls="mobile-menu"
              aria-expanded={isMenuOpen}
            >
              <span className="sr-only">Abrir menú</span>
              {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>

          {/* Navegación Desktop */}
          <div className="hidden md:flex items-center space-x-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive 
                      ? 'bg-[#6b4c64] text-white shadow-inner' 
                      : 'text-white/80 hover:bg-[#8f6b88] hover:text-white'
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
            {vendedor && (
              <div className="pl-2 ml-1 border-l border-white/20">
                <MenuVendedor vendedor={vendedor} nombreClassName="hidden xl:block text-sm font-medium text-white/90 truncate max-w-[10rem]" />
              </div>
            )}
          </div>
        </div>

        {/* Barra de pestañas con desplazamiento horizontal en móvil */}
        <div className="md:hidden overflow-x-auto scrollbar-none border-t border-white/10 py-2 -mx-4 px-4 flex items-center gap-2 whitespace-nowrap">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium shrink-0 transition-colors ${
                  isActive 
                    ? 'bg-[#6b4c64] text-white shadow-inner font-semibold' 
                    : 'text-white/80 bg-white/10 hover:bg-[#8f6b88] hover:text-white'
                }`}
              >
                <Icon size={14} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Menú desplegable vertical en móvil */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-[#6b4c64] bg-[#6e4e67] shadow-lg" id="mobile-menu">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-base font-medium transition-colors ${
                    isActive 
                      ? 'bg-[#5c3e55] text-white shadow-inner' 
                      : 'text-white/90 hover:bg-[#8f6b88] hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
