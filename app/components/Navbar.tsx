"use client"

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, Layers, Square, FileText, Triangle, BarChart2, Menu, X } from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
