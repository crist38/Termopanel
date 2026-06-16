'use client'

import { useState, useEffect, Suspense } from 'react';
import { obtenerDatosReportes, ReportStats } from '@/app/actions/reports';
import {
  DollarSign,
  ClipboardList,
  TrendingUp,
  Box,
  Loader2,
  ArrowLeft,
  Grid,
  Wrench,
  Users,
  Compass,
  FileSpreadsheet,
  RefreshCw
} from 'lucide-react';

function ReportsDashboardContent() {
  const [filtro, setFiltro] = useState<'diario' | 'mes' | 'historico'>('mes');
  const [clienteSeleccionado, setClienteSeleccionado] = useState<number | null>(null);
  const [clientes, setClientes] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [userName, setUserName] = useState('cristian3877');

  // Cargar nombre del usuario desde la cookie
  useEffect(() => {
    const cookieVal = document.cookie
      .split('; ')
      .find((r) => r.startsWith('odoo_user='))
      ?.split('=')
      .slice(1)
      .join('=');
    if (cookieVal) {
      try {
        const parsed = JSON.parse(decodeURIComponent(cookieVal));
        const name = parsed.name || parsed.email?.split('@')[0] || 'cristian3877';
        // Limpiar para que coincida con el estilo si es un email completo
        setUserName(name.includes('@') ? name.split('@')[0] : name);
      } catch {}
    }
  }, []);

  // Cargar datos de Odoo
  const fetchReportData = async (filterVal: 'diario' | 'mes' | 'historico', clientVal: number | null) => {
    setLoading(true);
    setError(null);
    try {
      const res = await obtenerDatosReportes(filterVal, clientVal || undefined);
      if (res.exito && res.data) {
        setStats(res.data);
        if (res.clientesDisponibles) {
          setClientes(res.clientesDisponibles);
        }
      } else {
        setError(res.error || 'Ocurrió un error al cargar los reportes.');
      }
    } catch (err: any) {
      console.error(err);
      setError('Error al comunicar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData(filtro, clienteSeleccionado);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, clienteSeleccionado]);

  const handleRefresh = () => {
    fetchReportData(filtro, clienteSeleccionado);
  };

  return (
    <div className="p-6 pb-12 bg-slate-50 min-h-screen font-sans">
      {/* Botón de retroceso */}
      <div className="max-w-7xl mx-auto mb-6">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700 font-medium text-sm transition-colors"
        >
          <ArrowLeft size={16} />
          Volver al Cotizador
        </a>
      </div>

      {/* Cabecera del Reporte */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">
            Bienvenido, {userName}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Aquí tienes un resumen de la actividad del negocio.
          </p>
        </div>

        {/* Controles de Filtro */}
        <div className="flex flex-col sm:flex-row items-center gap-3 self-stretch md:self-auto w-full md:w-auto">
          {/* Filtro por Cliente */}
          <div className="relative w-full sm:w-64">
            <select
              value={clienteSeleccionado || ''}
              onChange={(e) => {
                const val = e.target.value;
                setClienteSeleccionado(val ? parseInt(val, 10) : null);
              }}
              className="w-full appearance-none bg-white border border-slate-200 px-4 py-2.5 pr-10 rounded-xl text-slate-700 font-semibold shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all cursor-pointer text-sm truncate"
            >
              <option value="">Todos los Clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
              <Users size={16} />
            </div>
          </div>

          {/* Filtro por Período */}
          <div className="relative w-full sm:w-44">
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as 'diario' | 'mes' | 'historico')}
              className="w-full appearance-none bg-white border border-slate-200 px-4 py-2.5 pr-10 rounded-xl text-slate-700 font-semibold shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all cursor-pointer text-sm"
            >
              <option value="diario">Diario (Hoy)</option>
              <option value="mes">Este Mes</option>
              <option value="historico">Histórico</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
          </div>

          <button
            onClick={handleRefresh}
            className="flex items-center justify-center gap-2 bg-[#14b8a6] hover:bg-[#0d9488] text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all duration-200 transform active:scale-95 whitespace-nowrap w-full sm:w-auto"
            title="Refrescar reporte"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Nuevo Reporte
          </button>
        </div>
      </header>

      {/* Pantalla de Carga */}
      {loading && (
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-teal-600 animate-spin mb-4" />
          <p className="text-slate-500 font-medium text-sm">Cargando estadísticas del ERP Odoo...</p>
        </div>
      )}

      {/* Pantalla de Error */}
      {error && !loading && (
        <div className="max-w-7xl mx-auto bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl shadow-sm mb-8">
          <p className="font-bold text-lg">Error de carga</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={handleRefresh}
            className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium text-xs transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Contenido de Reportes */}
      {!loading && !error && stats && (
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Fila de 4 Tarjetas de KPIs */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Tarjeta 1: INGRESOS TOTALES */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="p-3.5 bg-emerald-500 text-white rounded-2xl shadow-sm">
                  <DollarSign size={24} />
                </div>
                <span className="bg-emerald-50 text-emerald-600 text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  +12%
                </span>
              </div>
              <div className="mt-4">
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Ingresos Totales</p>
                <p className="text-3xl font-black text-slate-800 mt-1 font-mono">
                  ${stats.ingresosTotales.toLocaleString('es-CL')}
                </p>
              </div>
            </div>

            {/* Tarjeta 2: PRESUPUESTOS EMITIDOS */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="p-3.5 bg-blue-500 text-white rounded-2xl shadow-sm">
                  <ClipboardList size={24} />
                </div>
                <span className="bg-emerald-50 text-emerald-600 text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  +5%
                </span>
              </div>
              <div className="mt-4">
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Presupuestos Emitidos</p>
                <p className="text-3xl font-black text-slate-800 mt-1 font-mono">
                  {stats.presupuestosEmitidos}
                </p>
              </div>
            </div>

            {/* Tarjeta 3: TICKET PROMEDIO */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="p-3.5 bg-orange-500 text-white rounded-2xl shadow-sm">
                  <TrendingUp size={24} />
                </div>
                <span className="bg-rose-50 text-rose-600 text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  -2%
                </span>
              </div>
              <div className="mt-4">
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Ticket Promedio</p>
                <p className="text-3xl font-black text-slate-800 mt-1 font-mono">
                  ${stats.ticketPromedio.toLocaleString('es-CL')}
                </p>
              </div>
            </div>

            {/* Tarjeta 4: ESTE MES */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="p-3.5 bg-purple-500 text-white rounded-2xl shadow-sm">
                  <Box size={24} />
                </div>
                <span className="bg-emerald-50 text-emerald-600 text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  +18%
                </span>
              </div>
              <div className="mt-4">
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Este Mes (Ventas)</p>
                <p className="text-3xl font-black text-slate-800 mt-1 font-mono">
                  {stats.esteMesCount}
                </p>
              </div>
            </div>
          </section>

          {/* Sección de Producción por Talleres y Mano de Obra */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Producción por Taller (m2) */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 lg:col-span-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Wrench className="text-teal-600" size={18} />
                  <h2 className="text-lg font-bold text-slate-800">Volumen de Producción por Taller</h2>
                </div>
                <p className="text-xs text-slate-400">Metros cuadrados totales realizados/maquilados en cada taller.</p>
              </div>

              <div className="mt-8 space-y-6">
                {/* Taller Corte Vidrio */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-slate-700">Taller Corte Vidrio</span>
                    <span className="text-sm font-bold text-teal-600 font-mono">{stats.tallerCorteM2.toFixed(2)} m²</span>
                  </div>
                  <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                    <div
                      className="bg-teal-500 h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${
                          stats.tallerCorteM2 + stats.tallerTermoM2 > 0
                            ? (stats.tallerCorteM2 / Math.max(stats.tallerCorteM2, stats.tallerTermoM2)) * 100
                            : 0
                        }%`
                      }}
                    />
                  </div>
                </div>

                {/* Taller Termopaneles */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-slate-700">Taller Termopaneles</span>
                    <span className="text-sm font-bold text-indigo-600 font-mono">{stats.tallerTermoM2.toFixed(2)} m²</span>
                  </div>
                  <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${
                          stats.tallerCorteM2 + stats.tallerTermoM2 > 0
                            ? (stats.tallerTermoM2 / Math.max(stats.tallerCorteM2, stats.tallerTermoM2)) * 100
                            : 0
                        }%`
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between text-xs text-slate-500">
                <span>* Calculado a partir de órdenes de venta confirmadas</span>
                <span>ProWindows Ltda.</span>
              </div>
            </div>

            {/* Total Mano de Obra */}
            <div className="bg-gradient-to-br from-teal-500 to-emerald-600 p-6 rounded-2xl shadow-sm text-white flex flex-col justify-between relative overflow-hidden">
              <div className="absolute right-0 bottom-0 opacity-10 translate-x-4 translate-y-4">
                <Wrench size={180} />
              </div>
              <div>
                <p className="text-xs text-teal-100 font-semibold uppercase tracking-wider">Costo Laboral</p>
                <h2 className="text-2xl font-bold mt-1">Total en Mano de Obra</h2>
                <p className="text-teal-50 text-xs mt-2 leading-relaxed">
                  Basado en la tasa de mano de obra de <strong>${stats.costoManoDeObra.toLocaleString()} CLP</strong> por m² de termopaneles ensamblados en el sistema.
                </p>
              </div>
              <div className="mt-8">
                <span className="text-xs text-teal-100 block">Mano de Obra Acumulada</span>
                <span className="text-4xl font-black font-mono block mt-1">
                  ${Math.round(stats.totalManoDeObra).toLocaleString('es-CL')}
                </span>
              </div>
            </div>
          </section>

          {/* Sección de Insumos y Materiales */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-6">
              <Grid className="text-teal-600" size={18} />
              <h2 className="text-lg font-bold text-slate-800">Insumos y Componentes Utilizados</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {/* Tarjeta Insumo 1: Cristales */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Vidrio en Corte</span>
                  <span className="text-xl font-bold text-slate-700 mt-1 block">Cristales Totales</span>
                </div>
                <div className="mt-4 text-right">
                  <span className="text-2xl font-black text-teal-600 font-mono">{stats.insumos.cristalTotalM2.toFixed(2)} m²</span>
                </div>
              </div>

              {/* Tarjeta Insumo 2: Hotmelt */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Sellante de Borde</span>
                  <span className="text-xl font-bold text-slate-700 mt-1 block">Hotmelt</span>
                </div>
                <div className="mt-4 text-right">
                  <span className="text-2xl font-black text-teal-600 font-mono">{stats.insumos.hotmelt.toFixed(2)} ml</span>
                </div>
              </div>

              {/* Tarjeta Insumo 3: Butilo */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Sello Primario</span>
                  <span className="text-xl font-bold text-slate-700 mt-1 block">Butilo</span>
                </div>
                <div className="mt-4 text-right">
                  <span className="text-2xl font-black text-teal-600 font-mono">{stats.insumos.butilo.toFixed(2)} ml</span>
                </div>
              </div>

              {/* Tarjeta Insumo 4: Escuadras */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Conectores de Esquina</span>
                  <span className="text-xl font-bold text-slate-700 mt-1 block">Escuadras</span>
                </div>
                <div className="mt-4 text-right">
                  <span className="text-2xl font-black text-teal-600 font-mono">{stats.insumos.escuadras} uds</span>
                </div>
              </div>
            </div>

            {/* Desgloses Detallados de Cristales y Separadores */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4 border-t border-slate-100">
              {/* Desglose de Cristales por Tipo */}
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
                  Consumo por Tipo de Cristal (m²)
                </h3>
                <div className="space-y-3">
                  {Object.keys(stats.insumos.cristalesTipo).length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Sin registros en el período.</p>
                  ) : (
                    Object.entries(stats.insumos.cristalesTipo).map(([tipo, m2]) => (
                      <div key={tipo} className="flex justify-between items-center text-xs p-2 bg-slate-50 rounded-lg hover:bg-slate-100/70 transition-colors">
                        <span className="text-slate-600 font-medium">{tipo}</span>
                        <span className="font-bold text-slate-800 font-mono">{m2.toFixed(2)} m²</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Desglose de Separadores por Color */}
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                  Separadores por Color y Espesor (ml)
                </h3>
                <div className="space-y-3">
                  {Object.keys(stats.insumos.separadoresColor).length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Sin registros en el período.</p>
                  ) : (
                    Object.entries(stats.insumos.separadoresColor).map(([color, sepData]) => {
                      const desperdicio = sepData.real > 0 ? ((sepData.real - sepData.neto) / sepData.real) * 100 : 0;
                      const tiras = Math.round(sepData.real / 5);
                      return (
                        <div key={color} className="p-3 bg-slate-50 rounded-xl hover:bg-slate-100/70 transition-colors space-y-1.5 border border-slate-100">
                          <div className="flex justify-between items-start text-xs font-semibold text-slate-700">
                            <span className="max-w-[70%] truncate" title={color}>{color}</span>
                            <span className="font-bold font-mono text-indigo-600 text-right whitespace-nowrap">
                              {sepData.real.toFixed(1)} ml ({tiras} tiras)
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
                            <span>Neto: {sepData.neto.toFixed(1)} ml</span>
                            <span>Desperdicio: <strong className="text-amber-600 font-mono">{desperdicio.toFixed(1)}%</strong></span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Estadísticas de Clientes (Ranking) */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-6">
              <Users className="text-teal-600" size={18} />
              <h2 className="text-lg font-bold text-slate-800">Estadísticas de Clientes Destacados</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="pb-3 w-12 text-center">Posición</th>
                    <th className="pb-3">Nombre del Cliente</th>
                    <th className="pb-3 text-center w-28">N° de Ventas</th>
                    <th className="pb-3 text-right w-40">Monto Comprado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.clientesRanking.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-slate-400 italic">
                        No se registraron ventas confirmadas en este período.
                      </td>
                    </tr>
                  ) : (
                    stats.clientesRanking.map((cliente, idx) => (
                      <tr key={cliente.name} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 text-center font-bold text-slate-400">
                          {idx + 1 === 1 ? '🥇' : idx + 1 === 2 ? '🥈' : idx + 1 === 3 ? '🥉' : idx + 1}
                        </td>
                        <td className="py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center font-semibold text-xs">
                              {cliente.name.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="font-semibold text-slate-700">{cliente.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 text-center font-mono font-medium text-slate-600">
                          {cliente.pedidos}
                        </td>
                        <td className="py-3.5 text-right font-bold text-slate-800 font-mono">
                          ${cliente.total.toLocaleString('es-CL')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Detalle de Presupuestos / Pedidos */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-6">
              <ClipboardList className="text-teal-600" size={18} />
              <h2 className="text-lg font-bold text-slate-800">Detalle de Presupuestos y Pedidos</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="pb-3">N° Presupuesto / Pedido</th>
                    <th className="pb-3">Cliente</th>
                    <th className="pb-3 text-center w-32">Fecha</th>
                    <th className="pb-3 text-center w-28">Estado</th>
                    <th className="pb-3 text-right w-40">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.pedidosDetalle.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-slate-400 italic">
                        No se encontraron registros en este período.
                      </td>
                    </tr>
                  ) : (
                    stats.pedidosDetalle.map((pedido) => (
                      <tr key={pedido.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 font-bold text-slate-800">
                          {pedido.name}
                        </td>
                        <td className="py-3.5">
                          <span className="font-semibold text-slate-700">{pedido.cliente}</span>
                        </td>
                        <td className="py-3.5 text-center text-slate-500 text-xs font-medium">
                          {pedido.fecha}
                        </td>
                        <td className="py-3.5 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            pedido.estado === 'Confirmado' || pedido.estado === 'Realizado'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              : pedido.estado === 'Cancelado'
                              ? 'bg-rose-50 text-rose-700 border border-rose-100'
                              : 'bg-amber-50 text-amber-700 border border-amber-100'
                          }`}>
                            {pedido.estado}
                          </span>
                        </td>
                        <td className="py-3.5 text-right font-bold text-slate-800 font-mono">
                          ${pedido.total.toLocaleString('es-CL')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default function ReportsDashboard() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
          <span className="text-slate-500 font-medium text-sm">Iniciando Dashboard...</span>
        </div>
      </div>
    }>
      <ReportsDashboardContent />
    </Suspense>
  );
}
