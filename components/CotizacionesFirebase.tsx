'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cloud, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  CotizacionFirestore,
  listarCotizacionesFirestore,
  firebaseConfigurado,
  RUTAS,
} from '@/lib/cotizacionesFirestore';

const TIPO: Record<CotizacionFirestore['coleccion'], string> = {
  presupuestos_termopaneles: 'Termopanel',
  presupuestos_monoliticos: 'Monolítico',
  presupuestos_formas: 'Formas',
};

/** Cotizaciones guardadas en Firebase mientras Odoo está suspendido. */
export function CotizacionesFirebase() {
  const router = useRouter();
  const [cotizaciones, setCotizaciones] = useState<CotizacionFirestore[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(true);

  useEffect(() => {
    if (!firebaseConfigurado()) {
      setCargando(false);
      return;
    }
    listarCotizacionesFirestore()
      .then(setCotizaciones)
      .catch((e) => setError(e?.message ?? 'No se pudieron cargar'))
      .finally(() => setCargando(false));
  }, []);

  if (!firebaseConfigurado()) return null;

  return (
    <div className="border-b border-slate-200 bg-amber-50/40">
      <button
        onClick={() => setAbierto(!abierto)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Cloud size={14} className="text-amber-600" />
          Guardadas en Firebase (Odoo suspendido)
          {!cargando && <span className="text-slate-400 font-normal">· {cotizaciones.length}</span>}
        </span>
        {abierto ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>

      {abierto && (
        <div className="pb-2">
          {cargando && (
            <div className="flex items-center gap-2 px-4 py-2 text-xs text-slate-500">
              <Loader2 size={12} className="animate-spin" /> Cargando...
            </div>
          )}
          {error && <p className="px-4 py-2 text-xs text-red-600">{error}</p>}
          {!cargando && !error && cotizaciones.length === 0 && (
            <p className="px-4 py-2 text-xs text-slate-400">Aún no hay cotizaciones guardadas en Firebase.</p>
          )}
          {cotizaciones.map((c) => (
            <button
              key={`${c.coleccion}/${c.id}`}
              onClick={() => router.push(`${RUTAS[c.coleccion]}?editId=${c.id}`)}
              className="w-full text-left px-4 py-2 hover:bg-amber-100/50 transition-colors flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">{c.budgetName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{TIPO[c.coleccion]}</span>
                  {c.confirmada && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Confirmada</span>
                  )}
                </div>
                <p className="text-xs text-slate-600 truncate">
                  {c.clientName}
                  {c.obra ? ` · ${c.obra}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                {typeof c.totalNeto === 'number' && (
                  <p className="text-xs font-semibold text-slate-700">${Math.round(c.totalNeto).toLocaleString('es-CL')}</p>
                )}
                {typeof c.totalNeto === 'number' && !!c.totalAbonado && (() => {
                  const totalConIva = c.totalNeto + Math.round(c.totalNeto * 0.19);
                  const saldo = Math.max(totalConIva - c.totalAbonado, 0);
                  return (
                    <p className={`text-[10px] font-semibold ${saldo > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {saldo > 0 ? `Saldo $${Math.round(saldo).toLocaleString('es-CL')}` : 'Pagado'}
                    </p>
                  );
                })()}
                {c.createdAt && <p className="text-[10px] text-slate-400">{c.createdAt.toLocaleDateString('es-CL')}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
