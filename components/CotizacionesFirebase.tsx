'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cloud, Loader2, ChevronDown, ChevronUp, Pencil, Trash2, RotateCcw } from 'lucide-react';
import {
  CotizacionFirestore,
  listarCotizacionesFirestore,
  marcarEliminadaFirestore,
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
  const [verEliminadas, setVerEliminadas] = useState(false);
  const [procesando, setProcesando] = useState<string | null>(null);

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

  const activas = cotizaciones.filter((c) => !c.eliminada);
  const eliminadas = cotizaciones.filter((c) => c.eliminada);

  const editar = (c: CotizacionFirestore) => router.push(`${RUTAS[c.coleccion]}?editId=${c.id}`);

  const cambiarEliminada = async (c: CotizacionFirestore, eliminada: boolean) => {
    if (eliminada && !confirm(`¿Eliminar la cotización ${c.budgetName} de ${c.clientName}?\n\nSe podrá recuperar desde "Ver eliminadas".`)) {
      return;
    }
    const clave = `${c.coleccion}/${c.id}`;
    setProcesando(clave);
    const res = await marcarEliminadaFirestore(c.coleccion, c.id, eliminada);
    setProcesando(null);
    if (!res.exito) {
      alert(`No se pudo ${eliminada ? 'eliminar' : 'restaurar'}: ${res.error}`);
      return;
    }
    setCotizaciones((prev) => prev.map((x) => (x.coleccion === c.coleccion && x.id === c.id ? { ...x, eliminada } : x)));
  };

  const fila = (c: CotizacionFirestore) => {
    const clave = `${c.coleccion}/${c.id}`;
    const ocupado = procesando === clave;
    return (
      <div
        key={clave}
        onClick={() => !c.eliminada && editar(c)}
        className={`w-full text-left px-4 py-2 transition-colors flex items-center justify-between gap-3 ${
          c.eliminada ? 'opacity-60' : 'hover:bg-amber-100/50 cursor-pointer'
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold text-slate-800 ${c.eliminada ? 'line-through' : ''}`}>{c.budgetName}</span>
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
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
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
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {ocupado ? (
              <Loader2 size={14} className="animate-spin text-slate-400 m-1.5" />
            ) : c.eliminada ? (
              <button
                onClick={() => cambiarEliminada(c, false)}
                title="Restaurar cotización"
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                <RotateCcw size={13} /> Restaurar
              </button>
            ) : (
              <>
                <button
                  onClick={() => editar(c)}
                  title="Editar cotización"
                  aria-label={`Editar ${c.budgetName}`}
                  className="p-1.5 rounded text-slate-500 hover:text-blue-700 hover:bg-blue-50"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => cambiarEliminada(c, true)}
                  title="Eliminar cotización"
                  aria-label={`Eliminar ${c.budgetName}`}
                  className="p-1.5 rounded text-slate-500 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="border-b border-slate-200 bg-amber-50/40">
      <button
        onClick={() => setAbierto(!abierto)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Cloud size={14} className="text-amber-600" />
          Guardadas en Firebase (Odoo suspendido)
          {!cargando && <span className="text-slate-400 font-normal">· {activas.length}</span>}
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
          {!cargando && !error && activas.length === 0 && (
            <p className="px-4 py-2 text-xs text-slate-400">Aún no hay cotizaciones guardadas en Firebase.</p>
          )}
          {activas.map(fila)}

          {eliminadas.length > 0 && (
            <>
              <button
                onClick={() => setVerEliminadas(!verEliminadas)}
                className="px-4 py-1.5 text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-1"
              >
                {verEliminadas ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {verEliminadas ? 'Ocultar eliminadas' : `Ver eliminadas (${eliminadas.length})`}
              </button>
              {verEliminadas && eliminadas.map(fila)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
