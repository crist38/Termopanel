"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, LifeBuoy, Loader2, Printer, RefreshCw, Save, Search } from "lucide-react";
import { imprimirOTReposicion } from "@/lib/utils/pdf-reposicion";
import type { DetalleTicketReposicion, TicketReposicionResumen } from "@/app/actions/reposiciones";
import {
  guardarReposicion,
  listarTicketsReposicion,
  obtenerTicketReposicion,
} from "@/app/actions/reposiciones";

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T"));
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function hoy() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function m2(ancho: number, alto: number, cantidad: number) {
  return Math.round((ancho / 1000) * (alto / 1000) * cantidad * 100) / 100;
}

function EtapaBadge({ etapa }: { etapa: string }) {
  const color = /cancel/i.test(etapa)
    ? "text-red-700 bg-red-50 border-red-200"
    : /solved|resuelto/i.test(etapa)
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : /progress|curso/i.test(etapa)
        ? "text-blue-700 bg-blue-50 border-blue-200"
        : "text-amber-700 bg-amber-50 border-amber-200";
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${color}`}>{etapa}</span>;
}

export default function ReposicionesPage() {
  const [tickets, setTickets] = useState<TicketReposicionResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const [ticketId, setTicketId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<DetalleTicketReposicion | null>(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleError, setDetalleError] = useState<string | null>(null);

  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [motivo, setMotivo] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [stageId, setStageId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "aviso" | "error"; texto: string } | null>(null);
  const [imprimiendo, setImprimiendo] = useState<number | null>(null);

  const cargarTickets = useCallback(async (q = "") => {
    setLoading(true);
    setError(null);
    const res = await listarTicketsReposicion(q);
    if (res.exito) setTickets(res.tickets ?? []);
    else setError(res.error || "No se pudieron cargar los tickets.");
    setLoading(false);
  }, []);

  useEffect(() => {
    cargarTickets();
  }, [cargarTickets]);

  const abrirTicket = async (id: number) => {
    setTicketId(id);
    setDetalle(null);
    setDetalleError(null);
    setMensaje(null);
    setDetalleLoading(true);
    const res = await obtenerTicketReposicion(id);
    if (res.exito && res.data) {
      const d = res.data;
      setDetalle(d);
      const iniciales: Record<number, number> = {};
      d.reposicion?.items.forEach(i => { iniciales[i.lineId] = i.cantidad; });
      setCantidades(iniciales);
      setMotivo(d.reposicion?.motivo ?? "");
      setFecha(d.reposicion?.fecha ?? hoy());
      setStageId(d.ticket.stageId);
    } else {
      setDetalleError(res.error || "No se pudo cargar el ticket.");
    }
    setDetalleLoading(false);
  };

  const cerrarTicket = () => {
    setTicketId(null);
    setDetalle(null);
    cargarTickets(busqueda);
  };

  const totales = useMemo(() => {
    let termo = 0;
    let mono = 0;
    detalle?.piezas.forEach(p => {
      const v = m2(p.ancho, p.alto, cantidades[p.lineId] || 0);
      if (p.tipo === "termopanel") termo += v;
      else mono += v;
    });
    return { termo, mono, corte: termo * 2 + mono };
  }, [detalle, cantidades]);

  // Cambios en pantalla que aún no se guardan en el ticket (la OT se imprime con lo guardado)
  const sinGuardar = useMemo(() => {
    const rep = detalle?.reposicion;
    if (!rep) return true;
    const guardadas: Record<number, number> = {};
    rep.items.forEach(i => { guardadas[i.lineId] = i.cantidad; });
    const ids = new Set([...Object.keys(guardadas), ...Object.keys(cantidades)].map(Number));
    for (const id of ids) if ((guardadas[id] || 0) !== (cantidades[id] || 0)) return true;
    return rep.motivo !== motivo.trim() || rep.fecha !== fecha;
  }, [detalle, cantidades, motivo, fecha]);

  const imprimirOT = async (id: number, datos?: DetalleTicketReposicion | null) => {
    setImprimiendo(id);
    try {
      let d = datos;
      if (!d) {
        const res = await obtenerTicketReposicion(id);
        if (!res.exito || !res.data) throw new Error(res.error || "No se pudo cargar el ticket.");
        d = res.data;
      }
      if (!d.reposicion) throw new Error("El ticket no tiene una reposición guardada.");
      await imprimirOTReposicion({ ticketRef: d.ticket.ticketRef, reposicion: d.reposicion });
    } catch (e: any) {
      alert(`Error al generar la OT: ${e.message}`);
    } finally {
      setImprimiendo(null);
    }
  };

  const handleGuardar = async () => {
    if (!ticketId) return;
    setSaving(true);
    setMensaje(null);
    const res = await guardarReposicion(ticketId, { cantidades, motivo, fecha, stageId });
    if (res.exito) {
      setMensaje(res.aviso ? { tipo: "aviso", texto: res.aviso } : { tipo: "ok", texto: "Reposición guardada en el ticket. Sus m² ya se suman en Reportes." });
      const refresco = await obtenerTicketReposicion(ticketId);
      if (refresco.exito && refresco.data) {
        setDetalle(refresco.data);
        setStageId(refresco.data.ticket.stageId);
      }
    } else {
      setMensaje({ tipo: "error", texto: res.error || "No se pudo guardar la reposición." });
    }
    setSaving(false);
  };

  // ─── Detalle del ticket ────────────────────────────────────────────────────
  if (ticketId) {
    const t = detalle?.ticket;
    return (
      <div className="p-4 pb-24 bg-slate-50 min-h-screen font-sans">
        <header className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <button onClick={cerrarTicket} className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-lg transition-colors" title="Volver a los tickets">
              <ArrowLeft size={16} />
            </button>
            <img src="/logo.png" alt="ProWindows Logo" className="h-10 sm:h-12 object-contain" />
            <div className="border-l-2 border-slate-200 pl-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Reposición · Soporte al Cliente</h2>
              <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-1">
                <span>Ticket</span>
                <div className="px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-slate-700 font-bold min-w-[3rem] text-center">
                  {t ? `#${t.ticketRef}` : "..."}
                </div>
                {t && <EtapaBadge etapa={t.etapa} />}
              </div>
            </div>
          </div>
          {detalle && (
            <div className="flex flex-wrap gap-2 items-center justify-center">
            <button
              onClick={() => imprimirOT(ticketId, detalle)}
              disabled={!detalle.reposicion || sinGuardar || imprimiendo !== null || saving}
              className="flex items-center gap-2 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none transform active:scale-95 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
              title={!detalle.reposicion ? "Guarda primero la reposición" : sinGuardar ? "Guarda los cambios antes de imprimir" : "Imprimir las órdenes de trabajo de las piezas a reparar"}
            >
              {imprimiendo === ticketId ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
              Imprimir OT
            </button>
            <button
              onClick={handleGuardar}
              disabled={saving || !detalle.venta || totales.termo + totales.mono <= 0}
              className="flex items-center gap-2 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none transform active:scale-95 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
              title="Guardar en el ticket de Odoo las piezas que se reponen"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? "Guardando..." : detalle.reposicion ? "Actualizar reposición" : "Guardar reposición"}
            </button>
            </div>
          )}
        </header>

        {detalleLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-[#7a5973] animate-spin" />
            <p className="text-sm text-slate-500">Cargando ticket...</p>
          </div>
        )}

        {detalleError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-2 items-start text-red-700 text-sm">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <p>{detalleError}</p>
          </div>
        )}

        {mensaje && (
          <div className={`mb-6 rounded-xl p-4 flex gap-2 items-start text-sm border ${
            mensaje.tipo === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : mensaje.tipo === "aviso" ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-red-50 border-red-200 text-red-700"
          }`}>
            {mensaje.tipo === "ok" ? <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />}
            <p>{mensaje.texto}</p>
          </div>
        )}

        {detalle && t && (
          <>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Asunto</label>
                  <div className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-800 truncate">{t.name || "—"}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Cliente del ticket</label>
                  <div className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-800 truncate">{t.cliente}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Asignado a</label>
                  <div className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-800 truncate">{t.asignado}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Venta ligada</label>
                  <div className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-800 truncate">
                    {detalle.venta ? `${detalle.venta.name} · ${detalle.venta.cliente} · ${formatDate(detalle.venta.fecha)}` : "Sin venta"}
                  </div>
                </div>
              </div>
            </div>

            {!detalle.venta ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-2 items-start text-amber-800 text-sm">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                <p>Este ticket no tiene una venta ligada. En Odoo, escribe el N° de venta en el asunto (ej. S00481) o complétalo en &quot;Ref. Sales Order&quot;.</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="text-left px-4 py-3">Ref</th>
                        <th className="text-left px-4 py-3">Tipo</th>
                        <th className="text-left px-4 py-3">Medida (mm)</th>
                        <th className="text-left px-4 py-3 min-w-[16rem]">Configuración</th>
                        <th className="text-center px-4 py-3">Cant. venta</th>
                        <th className="text-center px-4 py-3">Cant. a reponer</th>
                        <th className="text-right px-4 py-3">m² repuestos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detalle.piezas.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">La venta no tiene termopaneles ni cristales monolíticos del cotizador.</td></tr>
                      )}
                      {detalle.piezas.map(p => {
                        const cant = cantidades[p.lineId] || 0;
                        const config = p.nombre.split("|").map(s => s.trim())
                          .filter(s => s && !/^\[.*\]$/.test(s) && !/^cantidad:/i.test(s) && !/^(termopanel|cristal monolítico)\s*\d/i.test(s))
                          .join(" · ");
                        return (
                          <tr key={p.lineId} className={cant > 0 ? "bg-indigo-50/40" : ""}>
                            <td className="px-4 py-3 font-bold text-slate-700">{p.ref}</td>
                            <td className="px-4 py-3">{p.tipo === "termopanel" ? "Termopanel" : "Monolítico"}</td>
                            <td className="px-4 py-3 font-mono">{p.ancho} x {p.alto}</td>
                            <td className="px-4 py-3 text-xs text-slate-500">{config || "—"}</td>
                            <td className="px-4 py-3 text-center">{p.cantidadVenta}</td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="number"
                                min={0}
                                max={p.cantidadVenta}
                                value={cant || ""}
                                placeholder="0"
                                onChange={e => {
                                  const v = Math.max(0, Math.min(p.cantidadVenta, Math.round(Number(e.target.value) || 0)));
                                  setCantidades(prev => ({ ...prev, [p.lineId]: v }));
                                }}
                                className="w-20 px-2 py-1 border border-slate-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
                              />
                            </td>
                            <td className="px-4 py-3 text-right font-mono">{m2(p.ancho, p.alto, cant).toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 lg:col-span-2 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">Motivo de la reposición</label>
                      <textarea
                        value={motivo}
                        onChange={e => setMotivo(e.target.value)}
                        maxLength={300}
                        rows={3}
                        placeholder="Ej. cristal trizado en la instalación"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1">Fecha de producción</label>
                        <input
                          type="date"
                          value={fecha}
                          onChange={e => setFecha(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">Los m² se suman a los talleres en esta fecha.</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1">Etapa del ticket</label>
                        <select
                          value={stageId ?? ""}
                          onChange={e => setStageId(e.target.value ? Number(e.target.value) : null)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        >
                          {detalle.etapas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                        <p className="text-[11px] text-slate-400 mt-1">Un ticket cancelado no suma m².</p>
                      </div>
                    </div>
                    {detalle.reposicion && (
                      <p className="text-xs text-slate-400">
                        Guardada por {detalle.reposicion.updatedBy} el {formatDate(detalle.reposicion.updatedAt)}.
                      </p>
                    )}
                  </div>

                  <div className="bg-gradient-to-br from-[#7a5973] to-indigo-700 p-5 rounded-xl shadow-sm text-white space-y-3">
                    <p className="text-xs text-white/70 font-semibold uppercase tracking-wider">Suma a los talleres</p>
                    <div className="flex justify-between text-sm"><span>Taller Corte Vidrio</span><span className="font-mono font-bold">{totales.corte.toFixed(2)} m²</span></div>
                    <div className="flex justify-between text-sm"><span>Taller Termopaneles</span><span className="font-mono font-bold">{totales.termo.toFixed(2)} m²</span></div>
                    <p className="text-[11px] text-white/70 pt-2 border-t border-white/20">
                      Al guardar se adjunta al ticket en Odoo, se publica una nota en su historial y los m² se suman en Reportes (también a la mano de obra).
                    </p>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  // ─── Listado de tickets ────────────────────────────────────────────────────
  return (
    <div className="p-4 pb-24 bg-slate-50 min-h-screen font-sans">
      <header className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="ProWindows Logo" className="h-10 sm:h-12 object-contain" />
          <div className="border-l-2 border-slate-200 pl-4">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <LifeBuoy size={14} /> Reposiciones
            </h2>
            <p className="text-xs text-slate-400 mt-1">Tickets de Soporte al Cliente de Odoo. Las piezas repuestas suman m² a los talleres.</p>
          </div>
        </div>
        <form
          onSubmit={e => { e.preventDefault(); cargarTickets(busqueda); }}
          className="flex items-center gap-2 w-full sm:w-auto"
        >
          <div className="relative flex-1 sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Cliente, asunto o N° de venta"
              className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <button type="submit" className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-lg transition-colors" title="Buscar">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </form>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-2 items-start text-red-700 text-sm mb-6">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Ticket</th>
              <th className="text-left px-4 py-3">Asunto</th>
              <th className="text-left px-4 py-3">Cliente</th>
              <th className="text-left px-4 py-3">Venta</th>
              <th className="text-left px-4 py-3">Asignado</th>
              <th className="text-left px-4 py-3">Etapa</th>
              <th className="text-left px-4 py-3">Creado</th>
              <th className="text-right px-4 py-3">Reposición</th>
              <th className="px-2 py-3"><span className="sr-only">OT</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && tickets.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400"><Loader2 className="inline animate-spin mr-2" size={16} />Cargando tickets...</td></tr>
            )}
            {!loading && tickets.length === 0 && !error && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">No hay tickets.</td></tr>
            )}
            {tickets.map(t => (
              <tr key={t.id} onClick={() => abrirTicket(t.id)} className="hover:bg-slate-50 cursor-pointer">
                <td className="px-4 py-3 font-bold text-slate-700">#{t.ticketRef}</td>
                <td className="px-4 py-3">{t.name || "—"}</td>
                <td className="px-4 py-3">{t.cliente}</td>
                <td className="px-4 py-3 font-mono text-xs">{t.venta ?? "—"}</td>
                <td className="px-4 py-3">{t.asignado}</td>
                <td className="px-4 py-3"><EtapaBadge etapa={t.etapa} /></td>
                <td className="px-4 py-3">{formatDate(t.creado)}</td>
                <td className="px-4 py-3 text-right">
                  {t.m2Reposicion !== null
                    ? <span className="font-mono font-bold text-indigo-600">{t.m2Reposicion.toFixed(2)} m²</span>
                    : <span className="text-slate-400 text-xs">Sin registrar</span>}
                </td>
                <td className="px-2 py-3 text-right">
                  {t.m2Reposicion !== null && (
                    <button
                      onClick={e => { e.stopPropagation(); imprimirOT(t.id); }}
                      disabled={imprimiendo !== null}
                      className="p-1.5 rounded-lg text-teal-700 hover:bg-teal-50 disabled:opacity-50"
                      title="Imprimir OT de reposición"
                    >
                      {imprimiendo === t.id ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
