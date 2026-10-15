"use client"

import { useState, useEffect, useCallback, useRef } from "react";
import {
  listarCotizacionesFabricacion,
  obtenerMedidasFabricacion,
  guardarMedidasFabricacion,
  enviarAFabricacion,
} from "@/app/actions/fabricacion";
import { EnvioFabricacion, MedidaFabricacion, NOMBRES_FIGURA, describirFigura } from "@/lib/types/fabricacion";
import { PRECIOS_VIDRIOS } from "@/lib/data/vidrios";
import { getTermopanelConfig } from "@/lib/configService";
import { imprimirOrdenesTaller } from "@/lib/utils/pdf-fabricacion";
import { EditorMedida, OpcionesVidrio } from "@/components/fabricacion/EditorMedida";
import {
  Search,
  RefreshCw,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Hammer,
  AlertTriangle,
  Loader2,
  Cloud,
  Plus,
  Trash2,
  Copy,
  Pencil,
  Printer,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SaleOrder {
  id: number;
  name: string;
  partner_id: [number, string];
  state: string;
  date_order: string;
  tieneMedidas?: boolean;
}

interface OrderLine {
  id: number;
  name: string;
  product_id: [number, string] | false;
  product_uom_qty: number;
  display_type: string | false;
}

interface OrderDetail extends SaleOrder {
  order_line: OrderLine[];
}

// Fila editable: igual a la medida guardada, más un id local para React
type FilaMedida = MedidaFabricacion & { id: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const OPCIONES_DEFAULT: OpcionesVidrio = {
  vidrios: PRECIOS_VIDRIOS,
  separadores: [6, 8, 10, 12],
  coloresSeparador: ["Mate", "Negro", "Bronce"],
};

const STATE_LABELS: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  draft: { label: "Borrador", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", dot: "bg-amber-400" },
  sent: { label: "Enviado", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", dot: "bg-blue-400" },
  sale: { label: "Confirmado", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-400" },
  done: { label: "Bloqueado", color: "text-slate-700", bg: "bg-slate-100 border-slate-200", dot: "bg-slate-400" },
  cancel: { label: "Cancelado", color: "text-red-700", bg: "bg-red-50 border-red-200", dot: "bg-red-400" },
};

function StateBadge({ state }: { state: string }) {
  const cfg = STATE_LABELS[state] ?? { label: state, color: "text-slate-600", bg: "bg-slate-100 border-slate-200", dot: "bg-slate-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function nuevoId() {
  return Math.random().toString(36).substring(2, 15);
}

// Las líneas de obra vienen como "[V1] Descripción de la ventana | 4/12/4 INC | Blanco"
function parseLineaObra(line: OrderLine, index: number) {
  const name = line.name || "";
  const ref = name.match(/\[([^\]]+)\]/)?.[1] ?? `V${index + 1}`;
  const descripcion = name.replace(/^\s*\[[^\]]+\]\s*/, "").replace(/\s+/g, " ").trim();
  // Composición del termopanel: cristal / separador / cristal
  const comp = name.match(/(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/);
  const composicion = comp
    ? { cristal1: parseInt(comp[1], 10), separador: parseInt(comp[2], 10), cristal2: parseInt(comp[3], 10) }
    : null;
  return { ref, descripcion, composicion };
}

// Una ventana puede llevar varios termopaneles (paños pegados): V1 pasa a ser V1a, V1b, V1c...
function esPanoDe(ref: string, base: string) {
  return ref === base || (ref.length === base.length + 1 && ref.startsWith(base) && /[a-z]$/.test(ref));
}

// Referencia para una medida nueva de la ventana `base`: la base sola si es la primera,
// o la siguiente letra libre si ya hay otras (la que quedó sin letra cuenta como "a").
function siguienteRef(base: string, filas: { ref: string }[]) {
  const panos = filas.filter((f) => esPanoDe(f.ref, base));
  if (panos.length === 0) return base;
  const usadas = new Set(panos.map((f) => (f.ref === base ? "a" : f.ref.slice(-1))));
  const letra = "abcdefghijklmnopqrstuvwxyz".split("").find((l) => !usadas.has(l));
  return letra ? base + letra : base;
}

function filaVacia(ref = ""): FilaMedida {
  return {
    id: nuevoId(),
    ref,
    cantidad: 1,
    ancho: 0,
    alto: 0,
    cristal1: { tipo: "Incoloro", espesor: 4 },
    cristal2: { tipo: "Incoloro", espesor: 4 },
    separador: { espesor: 12, color: "Mate" },
    pulido: false,
    micropersiana: false,
    palillaje: false,
    palillajeColor: "Blanco",
    palillajeHorizontales: 0,
    palillajeVerticales: 0,
    tipoFigura: "rectangulo",
    observacion: "",
  };
}

const PAGE_SIZE = 15;

const celdaInput = "w-full text-center bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 outline-none font-medium text-slate-700";
const celdaMedida = "w-full min-w-[70px] appearance-none text-center bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 outline-none text-slate-800 font-bold text-sm";
const celdaTipo = "w-full bg-transparent text-[11px] p-1 outline-none min-w-[80px] text-slate-700";
const celdaMm = "w-full min-w-[56px] bg-transparent text-sm font-bold p-1 outline-none text-center text-slate-800";

// ─── Component ───────────────────────────────────────────────────────────────

export default function FabricacionPage() {
  // Listado
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Venta abierta
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Medidas
  const [filas, setFilas] = useState<FilaMedida[]>([]);
  const [guardadoInfo, setGuardadoInfo] = useState<{ updatedAt?: string; updatedBy?: string } | null>(null);
  const [cambios, setCambios] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fabricacion, setFabricacion] = useState<EnvioFabricacion | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "aviso" | "error"; texto: string } | null>(null);
  // Fila abierta en el editor de figuras
  const [editorId, setEditorId] = useState<string | null>(null);
  const [opciones, setOpciones] = useState<OpcionesVidrio>(OPCIONES_DEFAULT);

  // Tipos de cristal y separadores definidos en Configuración
  useEffect(() => {
    getTermopanelConfig()
      .then((conf) => {
        if (conf.vidrios?.length > 0) {
          setOpciones({
            vidrios: conf.vidrios,
            separadores: conf.separadores?.length ? conf.separadores : OPCIONES_DEFAULT.separadores,
            coloresSeparador: conf.coloresSeparador?.length ? conf.coloresSeparador : OPCIONES_DEFAULT.coloresSeparador,
          });
        }
      })
      .catch(() => {});
  }, []);

  // ─── Listado ───────────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async (s: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listarCotizacionesFabricacion({ search: s, limit: PAGE_SIZE, offset: p * PAGE_SIZE });
      if (res.exito && res.orders) {
        setOrders(res.orders);
        setTotal(res.total ?? 0);
      } else {
        setError(res.error ?? "Error desconocido");
      }
    } catch (e: any) {
      setError(e.message ?? "Error de conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders(search, page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Debounce de búsqueda
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setPage(0);
      fetchOrders(val, 0);
    }, 400);
  };

  const handleRefresh = () => {
    setPage(0);
    fetchOrders(search, 0);
  };

  const closeDetail = () => {
    if (cambios && !confirm("Hay medidas sin guardar. ¿Descartar los cambios?")) return;
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setFilas([]);
    setFabricacion(null);
    setGuardadoInfo(null);
    setEditorId(null);
    setCambios(false);
    setMensaje(null);
  };

  const openDetail = async (id: number) => {
    setSelectedId(id);
    setDetail(null);
    setFilas([]);
    setFabricacion(null);
    setGuardadoInfo(null);
    setCambios(false);
    setMensaje(null);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await obtenerMedidasFabricacion(id);
      if (res.exito && res.order) {
        setDetail(res.order as OrderDetail);
        const guardadas = res.medidas?.items ?? [];
        setFilas(guardadas.map((m) => ({ ...filaVacia(), ...m, id: nuevoId() })));
        if (guardadas.length > 0) {
          setGuardadoInfo({ updatedAt: res.medidas?.updatedAt, updatedBy: res.medidas?.updatedBy });
        }
        setFabricacion(res.medidas?.fabricacion ?? null);
      } else {
        setDetailError(res.error ?? "No se pudo cargar el detalle");
      }
    } catch (e: any) {
      setDetailError(e.message ?? "Error de conexión");
    } finally {
      setDetailLoading(false);
    }
  };

  // ─── Edición de medidas ────────────────────────────────────────────────────
  const marcarCambio = () => {
    setCambios(true);
    setMensaje(null);
  };

  const actualizarFila = (id: string, cambio: Partial<FilaMedida>) => {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...cambio } : f)));
    marcarCambio();
  };

  // Las cotizaciones de obra traen espesores que no están en la lista de precios (ej: separador de 9 mm):
  // el valor actual siempre se ofrece como opción.
  const tiposVidrio = (actual: string) => Array.from(new Set([...opciones.vidrios.map((v) => v.tipo), actual]));
  const getEspesores = (tipo: string, actual: number) => {
    const normalizado = tipo.trim().toLowerCase();
    const lista = opciones.vidrios.filter((v) => v.tipo.trim().toLowerCase() === normalizado).map((v) => v.espesor);
    return Array.from(new Set([...lista, actual])).filter((e) => e > 0).sort((a, b) => a - b);
  };
  const espesoresSeparador = (actual: number) =>
    Array.from(new Set([...opciones.separadores, actual])).filter((e) => e > 0).sort((a, b) => a - b);
  const coloresSeparador = (actual: string) => Array.from(new Set([...opciones.coloresSeparador, actual]));

  const cambiarTipoCristal = (fila: FilaMedida, campo: "cristal1" | "cristal2", tipo: string) => {
    const lista = getEspesores(tipo, 0);
    const espesor = lista.includes(fila[campo].espesor) || lista.length === 0 ? fila[campo].espesor : lista[0];
    actualizarFila(fila.id, { [campo]: { tipo, espesor } });
  };

  const agregarFila = () => {
    setFilas((prev) => [...prev, filaVacia()]);
    marcarCambio();
  };

  const agregarDesdeLinea = (line: OrderLine, index: number) => {
    const { ref, composicion } = parseLineaObra(line, index);
    const nuevaRef = siguienteRef(ref, filas);
    const fila = filaVacia(nuevaRef);
    const hermana = [...filas].reverse().find((f) => esPanoDe(f.ref, ref));
    if (hermana) {
      // Los paños de una misma ventana suelen llevar el mismo vidrio
      fila.cristal1 = { ...hermana.cristal1 };
      fila.cristal2 = { ...hermana.cristal2 };
      fila.separador = { ...hermana.separador };
    } else if (composicion) {
      fila.cristal1.espesor = composicion.cristal1;
      fila.cristal2.espesor = composicion.cristal2;
      fila.separador.espesor = composicion.separador;
    }
    // Al sumar un segundo paño a la ventana, el primero (sin letra) pasa a ser el "a"
    setFilas((prev) => [
      ...prev.map((f) => (nuevaRef !== ref && f.ref === ref ? { ...f, ref: `${ref}a` } : f)),
      fila,
    ]);
    marcarCambio();
  };

  const duplicarFila = (fila: FilaMedida) => {
    setFilas((prev) => {
      const idx = prev.findIndex((f) => f.id === fila.id);
      return [...prev.slice(0, idx + 1), { ...fila, id: nuevoId() }, ...prev.slice(idx + 1)];
    });
    marcarCambio();
  };

  const eliminarFila = (id: string) => {
    setFilas((prev) => prev.filter((f) => f.id !== id));
    marcarCambio();
  };

  const guardarDesdeEditor = (medida: MedidaFabricacion) => {
    if (!editorId) return;
    // medidasFigura se pasa siempre para que se borre al volver a rectángulo
    actualizarFila(editorId, { ...medida, medidasFigura: medida.medidasFigura });
    setEditorId(null);
  };

  const validarFilas = (): string | null => {
    if (filas.length === 0) return "Agrega al menos una medida.";
    const incompleta = filas.find((f) => !(f.ancho > 0) || !(f.alto > 0));
    if (incompleta) return `Falta el ancho o el alto en la medida de "${incompleta.ref || "sin ref."}".`;
    return null;
  };

  const handleGuardar = async () => {
    if (!detail) return;
    const problema = validarFilas();
    if (problema) {
      setMensaje({ tipo: "error", texto: problema });
      return;
    }
    setSaving(true);
    setMensaje(null);
    try {
      const items: MedidaFabricacion[] = filas.map(({ id, ...medida }) => medida);
      const res = await guardarMedidasFabricacion(detail.id, items);
      if (res.exito) {
        setCambios(false);
        setGuardadoInfo({ updatedAt: new Date().toISOString() });
        setOrders((prev) => prev.map((o) => (o.id === detail.id ? { ...o, tieneMedidas: true } : o)));
        setMensaje(
          res.aviso
            ? { tipo: "aviso", texto: res.aviso }
            : { tipo: "ok", texto: `Medidas adjuntadas a la venta ${detail.name} en Odoo.` }
        );
      } else {
        setMensaje({ tipo: "error", texto: res.error ?? "No se pudieron guardar las medidas" });
      }
    } catch (e: any) {
      setMensaje({ tipo: "error", texto: e.message ?? "Error de conexión" });
    } finally {
      setSaving(false);
    }
  };

  const handleEnviarAFabricacion = async () => {
    if (!detail) return;
    const pregunta = fabricacion
      ? `La venta ${detail.name} ya fue enviada a fabricación el ${formatDate(fabricacion.enviadoAt)}.\n\n` +
        `Si la envías de nuevo se crearán órdenes NUEVAS para todas las medidas, además de las ${fabricacion.moIds.length} que ya existen. ¿Continuar?`
      : `¿Enviar la venta ${detail.name} a fabricación?\n\n` +
        `Se crearán ${filas.length} orden${filas.length !== 1 ? "es" : ""} de fabricación en Odoo ` +
        `(Taller Corte Vidrio y Taller Termopaneles). Puede tardar un momento.`;
    if (!confirm(pregunta)) return;
    setEnviando(true);
    setMensaje(null);
    try {
      const res = await enviarAFabricacion(detail.id, !!fabricacion);
      if (res.exito) {
        if (res.fabricacion) setFabricacion(res.fabricacion);
        setMensaje(
          res.aviso
            ? { tipo: "aviso", texto: res.aviso }
            : { tipo: "ok", texto: `Venta ${detail.name} enviada a fabricación: se crearon las órdenes en Odoo.` }
        );
      } else {
        setMensaje({ tipo: "error", texto: res.error ?? "No se pudo enviar a fabricación" });
      }
    } catch (e: any) {
      setMensaje({ tipo: "error", texto: e.message ?? "Error de conexión" });
    } finally {
      setEnviando(false);
    }
  };

  const handleImprimirTaller = async () => {
    if (!detail) return;
    const problema = validarFilas();
    if (problema) {
      setMensaje({ tipo: "error", texto: problema });
      return;
    }
    await imprimirOrdenesTaller({
      ventaName: detail.name,
      clientName: detail.partner_id?.[1] ?? "",
      medidas: filas,
    });
  };

  const confirmada = detail?.state === "sale" || detail?.state === "done";
  const puedeEnviar = confirmada && !!guardadoInfo && !cambios && filas.length > 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const lineasObra = detail ? detail.order_line.filter((l) => !l.display_type && l.product_id) : [];
  const totalUnidades = filas.reduce((s, f) => s + (f.cantidad || 0), 0);
  const totalM2 = filas.reduce((s, f) => s + ((f.ancho || 0) / 1000) * ((f.alto || 0) / 1000) * (f.cantidad || 0), 0);
  const filaEditor = editorId ? filas.find((f) => f.id === editorId) : undefined;

  // ─── Listado de ventas ─────────────────────────────────────────────────────
  if (!selectedId) {
    return (
      <div className="p-4 bg-slate-50 min-h-screen font-sans">
        <header className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="ProWindows Logo" className="h-10 sm:h-12 object-contain" />
            <div className="hidden sm:block border-l-2 border-slate-200 pl-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Fabricación</h2>
              <p className="text-xs text-slate-500 mt-1">Ventas de obra con la etiqueta Taller PVC en Odoo</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 bg-[#7a5973] hover:bg-[#6b4c64] text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md transition-all duration-200 disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </header>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <div className="relative flex-1 max-w-xl">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Buscar por N° de venta o cliente..."
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>
            <span className="text-xs text-slate-500">
              {loading ? "Cargando..." : `${total} venta${total !== 1 ? "s" : ""} de Taller PVC`}
              {totalPages > 1 && ` · Página ${page + 1} de ${totalPages}`}
            </span>
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 text-[#7a5973] animate-spin" />
              <p className="text-sm text-slate-500">Cargando ventas...</p>
            </div>
          )}

          {!loading && error && (
            <div className="m-4 bg-red-50 border border-red-200 rounded-xl p-5 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
                <AlertTriangle size={16} />
                Error al cargar
              </div>
              <p className="text-xs text-red-600">{error}</p>
              <button
                onClick={handleRefresh}
                className="self-start mt-1 bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
              >
                Reintentar
              </button>
            </div>
          )}

          {!loading && !error && orders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-400">
              <Hammer size={40} strokeWidth={1.2} />
              <p className="text-sm font-medium">No se encontraron ventas</p>
              <p className="text-xs">Solo se muestran las que tienen la etiqueta Taller PVC en Odoo</p>
            </div>
          )}

          {!loading && !error && orders.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[11px] tracking-wider">
                  <tr>
                    <th className="p-3 text-left">N° Venta</th>
                    <th className="p-3 text-left">Cliente</th>
                    <th className="p-3 text-center">Fecha</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3 text-center">Medidas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => openDetail(order.id)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="p-3 font-bold text-slate-800">{order.name}</td>
                      <td className="p-3 text-slate-600">{order.partner_id?.[1] ?? "—"}</td>
                      <td className="p-3 text-center text-slate-500 text-xs">{formatDate(order.date_order)}</td>
                      <td className="p-3 text-center"><StateBadge state={order.state} /></td>
                      <td className="p-3 text-center">
                        {order.tieneMedidas ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <CheckCircle2 size={11} /> Con medidas
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                            Sin medidas
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="border-t border-slate-100 p-3 flex items-center justify-between">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <span className="text-xs text-slate-500 font-medium">{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Venta abierta: medidas de termopaneles ────────────────────────────────
  return (
    <div className="p-4 pb-24 bg-slate-50 min-h-screen font-sans">
      <header className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <button
            onClick={closeDetail}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-lg transition-colors"
            title="Volver al listado de ventas"
          >
            <ArrowLeft size={16} />
          </button>
          <img src="/logo.png" alt="ProWindows Logo" className="h-10 sm:h-12 object-contain" />
          <div className="border-l-2 border-slate-200 pl-4">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Fabricación · Taller PVC</h2>
            <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-1">
              <span>Venta N°</span>
              <div className="px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-slate-700 font-bold min-w-[4rem] text-center">
                {detail ? detail.name : "..."}
              </div>
              {detail && <StateBadge state={detail.state} />}
            </div>
          </div>
        </div>
        {detail && (
          <div className="flex flex-wrap gap-2 items-center justify-center">
            <button
              onClick={handleGuardar}
              disabled={saving || enviando || filas.length === 0 || !cambios}
              className="flex items-center gap-2 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none transform active:scale-95 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
              title="Adjuntar las medidas a la venta en Odoo, sin modificar sus líneas ni precios"
            >
              <Cloud size={16} className={saving ? "animate-spin" : ""} />
              {saving ? "Adjuntando..." : "Adjuntar medidas a la venta"}
            </button>
            <button
              onClick={handleEnviarAFabricacion}
              disabled={enviando || saving || !puedeEnviar}
              className="flex items-center gap-2 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none transform active:scale-95 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
              title="Crear las órdenes de fabricación y de trabajo en Odoo con las medidas adjuntas"
            >
              {enviando ? <Loader2 size={16} className="animate-spin" /> : <Hammer size={16} />}
              {enviando ? "Enviando..." : fabricacion ? "Reenviar a fabricación" : "Enviar a fabricación"}
            </button>
          </div>
        )}
      </header>

      {detailLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 text-[#7a5973] animate-spin" />
          <p className="text-sm text-slate-500">Cargando venta...</p>
        </div>
      )}

      {detailError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-2 items-start text-red-700 text-sm">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <p>{detailError}</p>
        </div>
      )}

      {detail && (
        <>
          {/* Datos de la venta (solo lectura: vienen de Odoo) */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Nombre Cliente</label>
                <div className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-800 truncate">
                  {detail.partner_id?.[1] ?? "—"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Fecha de la Venta</label>
                <div className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-800">
                  {formatDate(detail.date_order)}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Medidas</label>
                <div className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-800 truncate">
                  {cambios
                    ? "Cambios sin adjuntar"
                    : guardadoInfo?.updatedAt
                      ? `Adjuntas el ${formatDate(guardadoInfo.updatedAt)}`
                      : "Sin adjuntar"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Fabricación</label>
                <div className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-800 truncate">
                  {fabricacion
                    ? `Enviada el ${formatDate(fabricacion.enviadoAt)} (${fabricacion.moIds.length} orden${fabricacion.moIds.length !== 1 ? "es" : ""})`
                    : confirmada
                      ? "Sin enviar"
                      : "La venta debe estar confirmada"}
                </div>
              </div>
            </div>

            {/* Ventanas cobradas en la venta: cada una puede llevar uno o más termopaneles */}
            {lineasObra.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-sm font-medium text-slate-600 mb-2">
                  Ventanas de la venta <span className="text-xs font-normal text-slate-400">— toca «+» para agregar un termopanel de esa ventana</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {detail.order_line.map((line, index) => {
                    if (line.display_type || !line.product_id) return null;
                    const { ref, descripcion } = parseLineaObra(line, index);
                    const medidasRef = filas.filter((f) => esPanoDe(f.ref, ref)).length;
                    return (
                      <button
                        key={line.id}
                        onClick={() => agregarDesdeLinea(line, index)}
                        title={descripcion}
                        className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors max-w-full ${
                          medidasRef > 0
                            ? "text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                            : "text-[#7a5973] border-[#7a5973]/30 bg-white hover:bg-[#7a5973]/10"
                        }`}
                      >
                        <Plus size={13} className="flex-shrink-0" />
                        <span className="font-bold">{ref}</span>
                        <span className="font-normal text-slate-500 truncate max-w-[16rem]">{descripcion}</span>
                        {medidasRef > 0 && <span className="bg-emerald-600 text-white rounded-full px-1.5 text-[10px]">{medidasRef}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {mensaje && (
            <div
              className={`rounded-xl p-3.5 mb-6 flex gap-2 items-start text-sm border ${
                mensaje.tipo === "ok"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : mensaje.tipo === "aviso"
                    ? "bg-amber-50 border-amber-200 text-amber-700"
                    : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {mensaje.tipo === "ok" ? (
                <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              )}
              <p>{mensaje.texto}</p>
            </div>
          )}

          {/* Tabla de medidas */}
          <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-slate-200">
            <table className="min-w-full text-xs sm:text-sm">
              <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[11px] tracking-wider">
                <tr>
                  <th className="p-3 text-center border-r border-slate-200 w-24">Ref / Posición</th>
                  <th className="p-3 text-center border-r border-slate-200 w-16">Cant.</th>
                  <th className="p-3 text-center border-r border-slate-200 bg-blue-50/50" colSpan={2}>Dimensiones (mm)</th>
                  <th className="p-3 text-center border-r border-slate-200 bg-amber-50/50" colSpan={2}>Cristal 1</th>
                  <th className="p-3 text-center border-r border-slate-200 bg-amber-50/50" colSpan={2}>Cristal 2</th>
                  <th className="p-3 text-center border-r border-slate-200 bg-gray-50/50" colSpan={2}>Separador</th>
                  <th className="p-3 text-center border-r border-slate-200 w-24">Extras</th>
                  <th className="p-3 text-center border-r border-slate-200 w-28">Figura</th>
                  <th className="p-3 text-center border-r border-slate-200">Observación</th>
                  <th className="p-3 text-center w-16"></th>
                </tr>
                <tr className="text-[10px] text-slate-500 bg-slate-50">
                  <th className="border-r border-slate-200"></th>
                  <th className="border-r border-slate-200"></th>
                  <th className="p-1 border-r border-t border-slate-200 text-center font-semibold">Ancho</th>
                  <th className="p-1 border-r border-t border-slate-200 text-center font-semibold">Alto</th>
                  <th className="p-1 border-r border-t border-slate-200 text-center font-semibold text-amber-700">Tipo</th>
                  <th className="p-1 border-r border-t border-slate-200 text-center font-semibold text-amber-700">mm</th>
                  <th className="p-1 border-r border-t border-slate-200 text-center font-semibold text-amber-700">Tipo</th>
                  <th className="p-1 border-r border-t border-slate-200 text-center font-semibold text-amber-700">mm</th>
                  <th className="p-1 border-r border-t border-slate-200 text-center font-semibold">mm</th>
                  <th className="p-1 border-r border-t border-slate-200 text-center font-semibold">Color</th>
                  <th className="p-1 border-r border-t border-slate-200 text-center font-semibold">Pu/M/P</th>
                  <th className="p-1 border-r border-t border-slate-200 text-center font-semibold">Forma</th>
                  <th className="border-r border-slate-200"></th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filas.length === 0 && (
                  <tr>
                    <td colSpan={14} className="p-8 text-center text-slate-400 text-sm">
                      Esta venta aún no tiene medidas. Toca «+» en una ventana o usa «Agregar Fila».
                    </td>
                  </tr>
                )}
                {filas.map((fila) => {
                  const figura = fila.tipoFigura || "rectangulo";
                  const conFigura = figura !== "rectangulo";
                  return (
                    <tr key={fila.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="p-1 border-r border-slate-100">
                        <input
                          type="text"
                          value={fila.ref}
                          onChange={(e) => actualizarFila(fila.id, { ref: e.target.value })}
                          className={`${celdaInput} placeholder-slate-400`}
                          placeholder="Ref"
                        />
                      </td>

                      {/* Cantidad */}
                      <td className="p-1 border-r border-slate-100">
                        <input
                          type="number" inputMode="numeric" min="1"
                          value={fila.cantidad || ""}
                          onChange={(e) => actualizarFila(fila.id, { cantidad: parseInt(e.target.value) || 0 })}
                          className={celdaInput}
                        />
                      </td>

                      {/* Ancho y alto: en figuras se editan desde el editor de formas */}
                      <td className="p-1 border-r border-slate-100">
                        <input
                          type="text" inputMode="numeric" pattern="[0-9]*"
                          value={fila.ancho === 0 ? "" : fila.ancho}
                          readOnly={conFigura}
                          title={conFigura ? "El ancho total se define en el editor de figura" : undefined}
                          onChange={(e) => actualizarFila(fila.id, { ancho: parseInt(e.target.value) || 0 })}
                          className={`${celdaMedida} ${conFigura ? "text-slate-400 cursor-default" : ""}`}
                        />
                      </td>
                      <td className="p-1 border-r border-slate-100">
                        <input
                          type="text" inputMode="numeric" pattern="[0-9]*"
                          value={fila.alto === 0 ? "" : fila.alto}
                          readOnly={conFigura}
                          title={conFigura ? "El alto total se define en el editor de figura" : undefined}
                          onChange={(e) => actualizarFila(fila.id, { alto: parseInt(e.target.value) || 0 })}
                          className={`${celdaMedida} ${conFigura ? "text-slate-400 cursor-default" : ""}`}
                        />
                      </td>

                      {/* Cristal 1 y 2 */}
                      {(["cristal1", "cristal2"] as const).map((campo) => (
                        <CeldasCristal
                          key={campo}
                          tipo={fila[campo].tipo}
                          espesor={fila[campo].espesor}
                          tipos={tiposVidrio(fila[campo].tipo)}
                          espesores={getEspesores(fila[campo].tipo, fila[campo].espesor)}
                          onTipo={(tipo) => cambiarTipoCristal(fila, campo, tipo)}
                          onEspesor={(espesor) => actualizarFila(fila.id, { [campo]: { ...fila[campo], espesor } })}
                        />
                      ))}

                      {/* Separador */}
                      <td className="p-1 border-r border-slate-100">
                        <select
                          value={fila.separador.espesor}
                          onChange={(e) => actualizarFila(fila.id, { separador: { ...fila.separador, espesor: parseInt(e.target.value) } })}
                          className={celdaMm}
                        >
                          {espesoresSeparador(fila.separador.espesor).map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="p-1 border-r border-slate-100">
                        <select
                          value={fila.separador.color}
                          onChange={(e) => actualizarFila(fila.id, { separador: { ...fila.separador, color: e.target.value } })}
                          className="w-full bg-transparent text-[11px] p-1 outline-none min-w-[60px] text-slate-700"
                        >
                          {coloresSeparador(fila.separador.color).map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>

                      {/* Extras (Condensados) */}
                      <td className="p-1 border-r border-slate-100 text-center">
                        <div className="flex justify-center gap-1.5 mb-1 flex-wrap">
                          <label title="Pulido" className="cursor-pointer text-xs flex items-center gap-0.5"><input type="checkbox" checked={!!fila.pulido} onChange={(e) => actualizarFila(fila.id, { pulido: e.target.checked })} className="accent-teal-600" /> Pu</label>
                          <label title="Micropersiana" className="cursor-pointer text-xs flex items-center gap-0.5"><input type="checkbox" checked={!!fila.micropersiana} onChange={(e) => actualizarFila(fila.id, { micropersiana: e.target.checked })} className="accent-teal-600" /> M</label>
                          <label title="Palillaje" className="cursor-pointer text-xs flex items-center gap-0.5"><input type="checkbox" checked={!!fila.palillaje} onChange={(e) => actualizarFila(fila.id, { palillaje: e.target.checked })} className="accent-teal-600" /> P</label>
                        </div>
                        {fila.palillaje && (
                          <div className="mt-1 flex flex-col gap-1 text-[10px] bg-slate-50 p-1.5 rounded border border-slate-200 text-left max-w-[110px] mx-auto shadow-sm">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-slate-500">Color:</span>
                              <select
                                value={fila.palillajeColor || "Blanco"}
                                onChange={(e) => actualizarFila(fila.id, { palillajeColor: e.target.value })}
                                className="bg-white border border-slate-200 rounded px-1 py-0.5 text-[9px] text-slate-700 outline-none w-[60px]"
                              >
                                <option value="Blanco">Blanco</option>
                                <option value="Negro">Negro</option>
                                <option value="Marron">Marron</option>
                                <option value="Toffe">Toffe</option>
                              </select>
                            </div>
                            <div className="flex gap-2 justify-between">
                              <div className="flex items-center">
                                <span className="font-semibold text-slate-500 mr-0.5">H:</span>
                                <input
                                  type="number" inputMode="numeric" min="0"
                                  value={fila.palillajeHorizontales ?? 0}
                                  onChange={(e) => actualizarFila(fila.id, { palillajeHorizontales: parseInt(e.target.value) || 0 })}
                                  className="bg-white border border-slate-200 rounded w-7 py-0.5 text-center text-[9px] text-slate-700 outline-none"
                                />
                              </div>
                              <div className="flex items-center">
                                <span className="font-semibold text-slate-500 mr-0.5">V:</span>
                                <input
                                  type="number" inputMode="numeric" min="0"
                                  value={fila.palillajeVerticales ?? 0}
                                  onChange={(e) => actualizarFila(fila.id, { palillajeVerticales: parseInt(e.target.value) || 0 })}
                                  className="bg-white border border-slate-200 rounded w-7 py-0.5 text-center text-[9px] text-slate-700 outline-none"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Figura: abre el editor completo de formas */}
                      <td className="p-1 border-r border-slate-100 text-center">
                        <button
                          onClick={() => setEditorId(fila.id)}
                          title={conFigura ? describirFigura(fila) : "Dar forma a este termopanel (arco, círculo, forma libre...)"}
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md border transition-colors ${
                            conFigura
                              ? "text-cyan-700 bg-cyan-50 border-cyan-200 hover:bg-cyan-100 uppercase"
                              : "text-slate-400 border-transparent hover:text-slate-700 hover:border-slate-200"
                          }`}
                        >
                          <Pencil size={11} /> {conFigura ? NOMBRES_FIGURA[figura] : "Recta"}
                        </button>
                      </td>

                      {/* Observación */}
                      <td className="p-1 border-r border-slate-100">
                        <input
                          type="text"
                          value={fila.observacion ?? ""}
                          onChange={(e) => actualizarFila(fila.id, { observacion: e.target.value })}
                          className="w-full min-w-[110px] bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 outline-none text-xs text-slate-700"
                        />
                      </td>

                      {/* Duplicar / Eliminar */}
                      <td className="p-1 text-center whitespace-nowrap">
                        <button
                          onClick={() => duplicarFila(fila)}
                          className="text-slate-300 hover:text-slate-600 transition-colors p-1"
                          title="Duplicar fila"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          onClick={() => eliminarFila(fila.id)}
                          className="text-red-500 bg-red-50 hover:bg-red-500 hover:text-white rounded transition-colors p-1"
                          title="Eliminar fila"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-4">
            <button
              onClick={agregarFila}
              className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-lg shadow-sm flex items-center gap-2 transition-all hover:shadow-md text-sm font-medium"
            >
              <Plus size={18} /> Agregar Fila
            </button>
            <button
              onClick={handleImprimirTaller}
              disabled={filas.length === 0}
              className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-200 disabled:opacity-50 disabled:pointer-events-none"
              title="Descargar las órdenes de trabajo para Taller Corte Vidrio y Taller Termopaneles"
            >
              <Printer size={16} /> Taller PDF
            </button>
          </div>

          {/* Footer fijo con resumen */}
          <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-200 shadow-[0_-8px_30px_rgb(0,0,0,0.04)] p-4 z-40">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-50 text-teal-600 rounded-lg">
                  <ClipboardList size={20} />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Metraje Total</p>
                  <p className="text-sm sm:text-base font-bold text-slate-800">
                    Total Metros Cuadrados: <span className="text-teal-600 font-mono">{totalM2.toFixed(2)} m²</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Termopaneles</p>
                  <p className="text-sm font-bold text-slate-800 font-mono">{totalUnidades}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Venta Odoo</p>
                  <p className="text-sm font-bold text-teal-700 font-mono">{detail.name}</p>
                </div>
              </div>
            </div>
          </footer>
        </>
      )}

      {filaEditor && (
        <EditorMedida
          key={filaEditor.id}
          inicial={filaEditor}
          opciones={opciones}
          esNueva={false}
          onGuardar={guardarDesdeEditor}
          onCancelar={() => setEditorId(null)}
        />
      )}
    </div>
  );
}

// Celdas de tipo y espesor de un cristal
function CeldasCristal({
  tipo,
  espesor,
  tipos,
  espesores,
  onTipo,
  onEspesor,
}: {
  tipo: string;
  espesor: number;
  tipos: string[];
  espesores: number[];
  onTipo: (tipo: string) => void;
  onEspesor: (espesor: number) => void;
}) {
  return (
    <>
      <td className="p-1 border-r border-slate-100">
        <select value={tipo} onChange={(e) => onTipo(e.target.value)} className={celdaTipo}>
          {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
      <td className="p-1 border-r border-slate-100">
        <select value={espesor} onChange={(e) => onEspesor(parseInt(e.target.value))} className={celdaMm}>
          {espesores.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
    </>
  );
}
