"use client"

import { useState, useEffect, useCallback, useRef } from "react";
import {
  listarCotizacionesOdoo,
  obtenerDetalleCotizacion,
  actualizarLineaCotizacion,
  cancelarCotizacion,
} from "@/app/actions/odoo";
import {
  Search,
  RefreshCw,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Edit3,
  Check,
  XCircle,
  FileText,
  AlertTriangle,
  Loader2,
  Save,
  Ban,
  ExternalLink,
  User,
  Calendar,
  DollarSign,
  Layers,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SaleOrder {
  id: number;
  name: string;
  partner_id: [number, string];
  state: string;
  amount_total: number;
  amount_untaxed: number;
  amount_tax: number;
  date_order: string;
  user_id: [number, string] | false;
}

interface OrderLine {
  id: number;
  name: string;
  product_id: [number, string] | false;
  product_uom_qty: number;
  price_unit: number;
  price_subtotal: number;
  display_type: string | false;
  x_studio_ancho_m?: number;
  x_studio_alto_m?: number;
}

interface OrderDetail extends SaleOrder {
  note: string | false;
  order_line: OrderLine[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function formatCLP(amount: number) {
  return `$${Math.round(amount).toLocaleString("es-CL")}`;
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const PAGE_SIZE = 15;

// ─── Component ────────────────────────────────────────────────────────────────

export default function CotizacionesPage() {
  // Listado
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detalle
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Edición de líneas
  const [editingLines, setEditingLines] = useState<Record<number, { price_unit: number; product_uom_qty: number }>>({});
  const [savingLine, setSavingLine] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Cancelar orden
  const [cancelling, setCancelling] = useState(false);

  // ── Fetch list ──────────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async (s: string, st: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listarCotizacionesOdoo({ search: s, state: st, limit: PAGE_SIZE, offset: p * PAGE_SIZE });
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
    fetchOrders(search, stateFilter, page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Debounce de búsqueda
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setPage(0);
      fetchOrders(val, stateFilter, 0);
    }, 400);
  };

  const handleStateChange = (val: string) => {
    setStateFilter(val);
    setPage(0);
    fetchOrders(search, val, 0);
  };

  const handleRefresh = () => {
    setPage(0);
    fetchOrders(search, stateFilter, 0);
    setSelectedId(null);
    setDetail(null);
  };

  // ── Fetch detail ────────────────────────────────────────────────────────────
  const openDetail = async (id: number) => {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    setEditingLines({});
    setSaveError(null);
    try {
      const res = await obtenerDetalleCotizacion(id);
      if (res.exito && res.order) {
        setDetail(res.order as OrderDetail);
      } else {
        setDetailError(res.error ?? "No se pudo cargar el detalle");
      }
    } catch (e: any) {
      setDetailError(e.message ?? "Error de conexión");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setEditingLines({});
    setSaveError(null);
  };

  // ── Edit lines ──────────────────────────────────────────────────────────────
  const startEditing = (line: OrderLine) => {
    setEditingLines(prev => ({
      ...prev,
      [line.id]: { price_unit: line.price_unit, product_uom_qty: line.product_uom_qty },
    }));
  };

  const cancelEditing = (lineId: number) => {
    setEditingLines(prev => {
      const n = { ...prev };
      delete n[lineId];
      return n;
    });
  };

  const saveLine = async (lineId: number) => {
    const edits = editingLines[lineId];
    if (!edits) return;
    setSavingLine(lineId);
    setSaveError(null);
    try {
      const res = await actualizarLineaCotizacion(lineId, edits);
      if (res.exito) {
        // Refrescar detalle
        if (detail) {
          const refreshed = await obtenerDetalleCotizacion(detail.id);
          if (refreshed.exito && refreshed.order) setDetail(refreshed.order as OrderDetail);
        }
        cancelEditing(lineId);
      } else {
        setSaveError(res.error ?? "Error al guardar");
      }
    } catch (e: any) {
      setSaveError(e.message ?? "Error de conexión");
    } finally {
      setSavingLine(null);
    }
  };

  // ── Cancel order ────────────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!detail) return;
    if (!confirm(`¿Seguro que deseas cancelar la orden ${detail.name}? Esta acción no se puede deshacer fácilmente.`)) return;
    setCancelling(true);
    try {
      const res = await cancelarCotizacion(detail.id);
      if (res.exito) {
        // Refrescar lista y detalle
        fetchOrders(search, stateFilter, page);
        openDetail(detail.id);
      } else {
        alert(`Error al cancelar: ${res.error}`);
      }
    } catch (e: any) {
      alert(`Error de conexión: ${e.message}`);
    } finally {
      setCancelling(false);
    }
  };

  // ── Pagination ──────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
          >
            <ArrowLeft size={16} />
            Volver
          </a>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#7a5973]/10 rounded-lg">
              <FileText size={18} className="text-[#7a5973]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight">Cotizaciones Odoo</h1>
              <p className="text-xs text-slate-400">Listado de órdenes de venta almacenadas en el sistema</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-2 bg-[#7a5973] hover:bg-[#6b4c64] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all duration-200 disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Actualizar
        </button>
      </div>

      <div className="flex h-[calc(100vh-73px)]">
        {/* ── Left panel: List ── */}
        <div className={`flex flex-col ${selectedId ? "hidden lg:flex lg:w-[52%]" : "w-full"} border-r border-slate-200 bg-white`}>
          
          {/* Filters */}
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Buscar por N° orden o cliente..."
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#7a5973]/30 focus:border-[#7a5973] text-slate-700 placeholder-slate-400 bg-slate-50/50"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              {[
                { val: "", label: "Todos" },
                { val: "draft", label: "Borrador" },
                { val: "sale", label: "Confirmado" },
                { val: "cancel", label: "Cancelado" },
              ].map(({ val, label }) => (
                <button
                  key={val}
                  onClick={() => handleStateChange(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    stateFilter === val
                      ? "bg-[#7a5973] text-white border-[#7a5973] shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:border-[#7a5973]/40 hover:text-[#7a5973]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Stats bar */}
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              {loading ? "Cargando..." : `${total} cotización${total !== 1 ? "es" : ""} encontrada${total !== 1 ? "s" : ""}`}
            </span>
            {totalPages > 1 && (
              <span>Página {page + 1} de {totalPages}</span>
            )}
          </div>

          {/* List content */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 text-[#7a5973] animate-spin" />
                <p className="text-sm text-slate-500">Cargando cotizaciones...</p>
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
                <FileText size={40} strokeWidth={1.2} />
                <p className="text-sm font-medium">No se encontraron cotizaciones</p>
                <p className="text-xs">Prueba cambiando los filtros de búsqueda</p>
              </div>
            )}

            {!loading && !error && orders.length > 0 && (
              <div className="divide-y divide-slate-100">
                {orders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => openDetail(order.id)}
                    className={`w-full text-left px-4 py-3.5 hover:bg-slate-50 transition-colors group ${
                      selectedId === order.id ? "bg-[#7a5973]/5 border-l-2 border-[#7a5973]" : "border-l-2 border-transparent"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-1.5 bg-slate-100 rounded-md group-hover:bg-[#7a5973]/10 transition-colors flex-shrink-0">
                          <Layers size={14} className="text-slate-500 group-hover:text-[#7a5973] transition-colors" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800 text-sm">{order.name}</span>
                            <StateBadge state={order.state} />
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {order.partner_id?.[1] ?? "—"}
                          </p>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-sm font-bold text-slate-800 font-mono">{formatCLP(order.amount_total)}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{formatDate(order.date_order)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-slate-100 p-3 flex items-center justify-between bg-white">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <span className="text-xs text-slate-500 font-medium">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* ── Right panel: Detail ── */}
        {selectedId && (
          <div className="flex-1 flex flex-col bg-white overflow-hidden">
            {/* Detail header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={closeDetail}
                  className="lg:hidden p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-500"
                >
                  <ArrowLeft size={16} />
                </button>
                <h2 className="font-bold text-slate-800 text-base">
                  {detail ? detail.name : `Cargando...`}
                </h2>
                {detail && <StateBadge state={detail.state} />}
              </div>
              <button
                onClick={closeDetail}
                className="hidden lg:flex p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-500"
              >
                <X size={16} />
              </button>
            </div>

            {/* Detail content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {detailLoading && (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-8 h-8 text-[#7a5973] animate-spin" />
                  <p className="text-sm text-slate-500">Cargando detalle...</p>
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
                  {/* Info cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        <User size={11} /> Cliente
                      </div>
                      <p className="text-sm font-semibold text-slate-700 leading-snug">
                        {detail.partner_id?.[1] ?? "—"}
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        <Calendar size={11} /> Fecha
                      </div>
                      <p className="text-sm font-semibold text-slate-700">
                        {formatDate(detail.date_order)}
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        <DollarSign size={11} /> Neto
                      </div>
                      <p className="text-sm font-bold text-slate-800 font-mono">
                        {formatCLP(detail.amount_untaxed)}
                      </p>
                    </div>

                    <div className="bg-[#7a5973]/5 border border-[#7a5973]/20 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 text-[#7a5973]/60 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        <DollarSign size={11} /> Total c/IVA
                      </div>
                      <p className="text-sm font-black text-[#7a5973] font-mono">
                        {formatCLP(detail.amount_total)}
                      </p>
                    </div>
                  </div>

                  {/* IVA breakdown */}
                  {detail.amount_tax > 0 && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 -mt-2 px-1">
                      <span>Neto: <strong className="text-slate-700">{formatCLP(detail.amount_untaxed)}</strong></span>
                      <span>+</span>
                      <span>IVA (19%): <strong className="text-slate-700">{formatCLP(detail.amount_tax)}</strong></span>
                      <span>=</span>
                      <span>Total: <strong className="text-slate-700">{formatCLP(detail.amount_total)}</strong></span>
                    </div>
                  )}

                  {/* Action buttons */}
                  {detail.state === 'draft' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                        <Edit3 size={12} />
                        Borrador — puedes editar precios y cantidades
                      </div>
                      <button
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-60"
                      >
                        <Ban size={12} />
                        {cancelling ? "Cancelando..." : "Cancelar Orden"}
                      </button>
                    </div>
                  )}

                  {detail.state === 'cancel' && (
                    <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg w-fit">
                      <XCircle size={12} />
                      Esta orden fue cancelada
                    </div>
                  )}

                  {(detail.state === 'sale' || detail.state === 'done') && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg w-fit">
                      <Check size={12} />
                      Orden confirmada — solo lectura
                    </div>
                  )}

                  {saveError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex gap-1.5 items-center">
                      <AlertTriangle size={12} /> {saveError}
                    </div>
                  )}

                  {/* Order lines */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                      <Layers size={15} className="text-[#7a5973]" />
                      Líneas del Pedido
                      <span className="text-xs font-normal text-slate-400">({detail.order_line.length} línea{detail.order_line.length !== 1 ? "s" : ""})</span>
                    </h3>

                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      {detail.order_line.length === 0 ? (
                        <p className="p-4 text-sm text-slate-400 italic text-center">Sin líneas de pedido</p>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {detail.order_line.map((line) => {
                            const isNote = line.display_type === 'line_note' || line.display_type === 'line_section';
                            const isEditing = !!editingLines[line.id];
                            const isSaving = savingLine === line.id;
                            const edits = editingLines[line.id] ?? { price_unit: line.price_unit, product_uom_qty: line.product_uom_qty };

                            if (isNote) {
                              return (
                                <div key={line.id} className="px-4 py-2.5 bg-slate-50/50">
                                  <p className="text-xs text-slate-500 italic">{line.name}</p>
                                </div>
                              );
                            }

                            return (
                              <div key={line.id} className={`p-4 ${isEditing ? "bg-amber-50/30" : "hover:bg-slate-50/50"} transition-colors`}>
                                <div className="flex flex-col gap-3">
                                  {/* Description */}
                                  <p className="text-xs text-slate-700 leading-relaxed">{line.name}</p>

                                  {/* Metrics row */}
                                  <div className="flex items-start gap-4 flex-wrap">
                                    {/* Quantity */}
                                    <div className="flex flex-col gap-1 min-w-[90px]">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cantidad (m²)</span>
                                      {isEditing ? (
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={edits.product_uom_qty}
                                          onChange={(e) =>
                                            setEditingLines(prev => ({
                                              ...prev,
                                              [line.id]: { ...prev[line.id], product_uom_qty: parseFloat(e.target.value) || 0 }
                                            }))
                                          }
                                          className="w-24 px-2 py-1 border border-amber-300 rounded-lg text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400/50 bg-white"
                                        />
                                      ) : (
                                        <span className="text-sm font-bold text-slate-700 font-mono">{line.product_uom_qty.toFixed(2)}</span>
                                      )}
                                    </div>

                                    {/* Price unit */}
                                    <div className="flex flex-col gap-1 min-w-[120px]">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Precio Unit.</span>
                                      {isEditing ? (
                                        <input
                                          type="number"
                                          step="1"
                                          min="0"
                                          value={edits.price_unit}
                                          onChange={(e) =>
                                            setEditingLines(prev => ({
                                              ...prev,
                                              [line.id]: { ...prev[line.id], price_unit: parseFloat(e.target.value) || 0 }
                                            }))
                                          }
                                          className="w-32 px-2 py-1 border border-amber-300 rounded-lg text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400/50 bg-white"
                                        />
                                      ) : (
                                        <span className="text-sm font-bold text-slate-700 font-mono">{formatCLP(line.price_unit)}</span>
                                      )}
                                    </div>

                                    {/* Subtotal */}
                                    <div className="flex flex-col gap-1">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subtotal</span>
                                      <span className="text-sm font-black text-slate-800 font-mono">
                                        {isEditing
                                          ? formatCLP(edits.price_unit * edits.product_uom_qty)
                                          : formatCLP(line.price_subtotal)}
                                      </span>
                                    </div>

                                    {/* Dimensions */}
                                    {line.x_studio_ancho_m != null && (
                                      <div className="flex flex-col gap-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Medidas (m)</span>
                                        <span className="text-xs text-slate-600 font-mono">
                                          {line.x_studio_ancho_m?.toFixed(3)} × {line.x_studio_alto_m?.toFixed(3)}
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Edit controls (only for draft) */}
                                  {detail.state === 'draft' && (
                                    <div className="flex items-center gap-2 pt-1">
                                      {!isEditing ? (
                                        <button
                                          onClick={() => startEditing(line)}
                                          className="flex items-center gap-1.5 text-[11px] font-semibold text-[#7a5973] hover:text-[#6b4c64] hover:bg-[#7a5973]/5 px-2.5 py-1.5 rounded-lg transition-colors border border-[#7a5973]/20"
                                        >
                                          <Edit3 size={11} /> Editar
                                        </button>
                                      ) : (
                                        <>
                                          <button
                                            onClick={() => saveLine(line.id)}
                                            disabled={isSaving}
                                            className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-colors border border-emerald-200 disabled:opacity-60"
                                          >
                                            {isSaving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                                            {isSaving ? "Guardando..." : "Guardar"}
                                          </button>
                                          <button
                                            onClick={() => cancelEditing(line.id)}
                                            disabled={isSaving}
                                            className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 px-2.5 py-1.5 rounded-lg transition-colors border border-slate-200 disabled:opacity-60"
                                          >
                                            <X size={11} /> Cancelar
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Note */}
                  {detail.note && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1.5">Notas</p>
                      <p className="text-xs text-blue-800 leading-relaxed" dangerouslySetInnerHTML={{ __html: detail.note }} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Empty detail state (desktop) ── */}
        {!selectedId && (
          <div className="hidden lg:flex flex-1 flex-col items-center justify-center gap-4 bg-slate-50/30 text-slate-400">
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
              <Eye size={40} strokeWidth={1.2} className="text-slate-300" />
            </div>
            <p className="text-sm font-medium">Selecciona una cotización para ver su detalle</p>
            <p className="text-xs">Haz clic en cualquier fila de la lista</p>
          </div>
        )}
      </div>
    </div>
  );
}
