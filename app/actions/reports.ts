'use server'

import { odoo } from '@/lib/odoo';
import { getTermopanelConfig } from '@/lib/configService';
import { getSession } from '@/app/actions/auth';

export interface ReportStats {
  ingresosTotales: number;
  presupuestosEmitidos: number;
  ticketPromedio: number;
  esteMesCount: number;
  tallerCorteM2: number;
  tallerTermoM2: number;
  totalManoDeObra: number;
  costoManoDeObra: number;
  insumos: {
    escuadras: number;
    hotmelt: number;
    butilo: number;
    cristalTotalM2: number;
    separadoresColor: Record<string, number>;
    cristalesTipo: Record<string, number>;
  };
  clientesRanking: Array<{
    name: string;
    pedidos: number;
    total: number;
  }>;
  pedidosDetalle: Array<{
    id: number;
    name: string;
    cliente: string;
    fecha: string;
    estado: string;
    total: number;
  }>;
}

export async function obtenerDatosReportes(
  filtro: 'diario' | 'mes' | 'historico' = 'mes',
  clienteId?: number
): Promise<{
  exito: boolean;
  data?: ReportStats;
  clientesDisponibles?: Array<{ id: number; name: string }>;
  error?: string;
}> {
  try {
    const session = await getSession();
    if (!session) {
      return { exito: false, error: 'No autorizado. Por favor inicie sesión.' };
    }

    // 1. Obtener variables de entorno y config de Firestore
    const defaultProductId = parseInt(process.env.ODOO_DEFAULT_PRODUCT_ID || '17983');
    const monoliticoProductId = parseInt(process.env.ODOO_MONOLITIC_PRODUCT_ID || process.env.ODOO_DEFAULT_PRODUCT_ID || '20193');

    const config = await getTermopanelConfig();
    const costoManoDeObra = config.parametrosCalculo?.costoManoDeObra ?? 1650;

    // 2. Traer todos los pedidos de venta de Odoo
    // Limitado a 500 para evitar sobrecarga, ordenados por id desc
    const orders = await odoo.executeKw('sale.order', 'search_read', [
      []
    ], {
      fields: ['id', 'name', 'partner_id', 'state', 'amount_total', 'date_order'],
      order: 'id desc',
      limit: 500,
    });

    if (!orders || !Array.isArray(orders)) {
      return { exito: false, error: 'No se recibieron datos de pedidos desde Odoo.' };
    }

    // Extraer todos los clientes únicos de los 500 pedidos originales (antes del filtrado)
    const clientesDisponiblesMap = new Map<number, string>();
    orders.forEach(o => {
      if (o.partner_id && Array.isArray(o.partner_id)) {
        clientesDisponiblesMap.set(o.partner_id[0], o.partner_id[1]);
      }
    });
    const clientesDisponibles = Array.from(clientesDisponiblesMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Obtener fecha actual
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    const currentDay = now.getDate();

    // Filtrar pedidos según el filtro seleccionado
    let ordersFiltrados = orders;
    if (filtro === 'diario') {
      ordersFiltrados = orders.filter(o => {
        if (!o.date_order) return false;
        const orderDate = new Date(o.date_order.replace(' ', 'T'));
        return orderDate.getFullYear() === currentYear &&
               orderDate.getMonth() === currentMonth &&
               orderDate.getDate() === currentDay;
      });
    } else if (filtro === 'mes') {
      ordersFiltrados = orders.filter(o => {
        if (!o.date_order) return false;
        // date_order está en formato "YYYY-MM-DD HH:MM:SS"
        const orderDate = new Date(o.date_order.replace(' ', 'T'));
        return orderDate.getFullYear() === currentYear && orderDate.getMonth() === currentMonth;
      });
    }

    // Filtrar pedidos por cliente si aplica
    if (clienteId) {
      ordersFiltrados = ordersFiltrados.filter(o => o.partner_id && o.partner_id[0] === clienteId);
    }

    // Pedidos/presupuestos a considerar en el filtro (para calcular insumos y producción, incluimos borradores y enviados)
    const confirmedOrders = ordersFiltrados.filter(o => o.state === 'draft' || o.state === 'sent' || o.state === 'sale' || o.state === 'done');

    // Pedidos/presupuestos en este mes (para el KPI "Este Mes" que se muestra fijo)
    // También filtrados por cliente si se especifica
    const confirmedEsteMes = orders.filter(o => {
      if (!o.date_order || (o.state !== 'draft' && o.state !== 'sent' && o.state !== 'sale' && o.state !== 'done')) return false;
      const orderDate = new Date(o.date_order.replace(' ', 'T'));
      const matchesMonth = orderDate.getFullYear() === currentYear && orderDate.getMonth() === currentMonth;
      if (!matchesMonth) return false;
      if (clienteId) {
        return o.partner_id && o.partner_id[0] === clienteId;
      }
      return true;
    });

    // 3. Calcular KPIs principales del gráfico superior
    const ingresosTotales = confirmedOrders.reduce((sum, o) => sum + (o.amount_total || 0), 0);
    const presupuestosEmitidos = ordersFiltrados.length;
    const ticketPromedio = confirmedOrders.length > 0 ? Math.round(ingresosTotales / confirmedOrders.length) : 0;
    const esteMesCount = confirmedEsteMes.length;

    // 4. Traer todas las líneas de pedido correspondientes a los pedidos confirmados
    const confirmedOrderIds = confirmedOrders.map(o => o.id);

    let lines: any[] = [];
    if (confirmedOrderIds.length > 0) {
      lines = await odoo.executeKw('sale.order.line', 'search_read', [
        [['order_id', 'in', confirmedOrderIds]]
      ], {
        fields: ['id', 'name', 'product_id', 'product_uom_qty', 'price_unit', 'x_studio_ancho_m', 'x_studio_alto_m', 'order_id'],
        limit: 1000
      });
    }

    // 5. Agregación de talleres, insumos y mano de obra
    let tallerCorteM2 = 0;
    let tallerTermoM2 = 0;
    let totalEscuadras = 0;
    let totalHotmelt = 0;
    let totalButilo = 0;
    let totalManoDeObra = 0;
    const separadoresColor: Record<string, number> = {};
    const cristalesTipo: Record<string, number> = {};

    lines.forEach((line) => {
      const prodId = line.product_id ? line.product_id[0] : 0;
      const isTermopanel = prodId === defaultProductId;
      const isMonolitico = prodId === monoliticoProductId;

      // Si no es un termopanel o monolítico generado por la app, ignorar
      if (!isTermopanel && !isMonolitico) return;

      const name = line.name || '';
      const qtyRounded = line.product_uom_qty || 0; // m² totales de la línea

      // Parsear cantidad
      let cantidad = 1;
      const cantMatch = name.match(/Cantidad:\s*(\d+)/i);
      if (cantMatch) {
        cantidad = parseInt(cantMatch[1], 10);
      }

      // Parsear dimensiones
      let ancho = 0;
      let alto = 0;
      const dimMatch = name.match(/(?:Termopanel|Cristal Monolítico)\s*(\d+)\s*x\s*(\d+)/i);
      if (dimMatch) {
        ancho = parseInt(dimMatch[1], 10);
        alto = parseInt(dimMatch[2], 10);
      } else {
        // Fallback usando los campos x_studio
        ancho = Math.round((line.x_studio_ancho_m || 0) * 1000);
        alto = Math.round(((line.x_studio_alto_m || 0) / cantidad) * 1000);
      }

      const areaM2 = qtyRounded;
      const perimMl = 2 * (ancho + alto) / 1000;
      const totalMl = perimMl * cantidad;

      if (isTermopanel) {
        tallerCorteM2 += areaM2;
        tallerTermoM2 += areaM2;

        totalEscuadras += 4 * cantidad;
        totalHotmelt += totalMl;
        totalButilo += totalMl;
        totalManoDeObra += costoManoDeObra * areaM2;

        // Separador por color
        const sepMatch = name.match(/Separador:\s*(\d+)mm\s*color\s*([^|]+)/i);
        if (sepMatch) {
          const color = sepMatch[2].trim();
          const thickness = sepMatch[1];
          const key = `Separador ${thickness}mm ${color}`;
          separadoresColor[key] = (separadoresColor[key] || 0) + totalMl;
        }

        // Cristales del termopanel (Cristal 1 y Cristal 2)
        const c1Match = name.match(/Cristal 1:\s*([^0-9|]+)\s*(\d+)mm/i);
        if (c1Match) {
          const key = `Cristal ${c1Match[1].trim()} ${c1Match[2]}mm`;
          cristalesTipo[key] = (cristalesTipo[key] || 0) + areaM2;
        }
        const c2Match = name.match(/Cristal 2:\s*([^0-9|]+)\s*(\d+)mm/i);
        if (c2Match) {
          const key = `Cristal ${c2Match[1].trim()} ${c2Match[2]}mm`;
          cristalesTipo[key] = (cristalesTipo[key] || 0) + areaM2;
        }
      } else if (isMonolitico) {
        tallerCorteM2 += areaM2;

        // Cristal monolítico (solo uno)
        const cMatch = name.match(/Cristal:\s*([^0-9|]+)\s*(\d+)mm/i);
        if (cMatch) {
          const key = `Cristal ${cMatch[1].trim()} ${cMatch[2]}mm`;
          cristalesTipo[key] = (cristalesTipo[key] || 0) + areaM2;
        }
      }
    });

    const cristalTotalM2 = Object.values(cristalesTipo).reduce((sum, v) => sum + v, 0);

    // 6. Ranking de Clientes
    const clientesMap: Record<string, { pedidos: number; total: number }> = {};
    confirmedOrders.forEach(o => {
      const clientName = o.partner_id ? o.partner_id[1] : 'Cliente Desconocido';
      if (!clientesMap[clientName]) {
        clientesMap[clientName] = { pedidos: 0, total: 0 };
      }
      clientesMap[clientName].pedidos += 1;
      clientesMap[clientName].total += (o.amount_total || 0);
    });

    const clientesRanking = Object.entries(clientesMap)
      .map(([name, stats]) => ({
        name,
        pedidos: stats.pedidos,
        total: stats.total
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10); // Top 10 clientes

    // Detalle de Pedidos
    const pedidosDetalle = ordersFiltrados.map(o => {
      let estadoEsp = o.state;
      switch (o.state) {
        case 'draft': estadoEsp = 'Borrador'; break;
        case 'sent': estadoEsp = 'Enviado'; break;
        case 'sale': estadoEsp = 'Confirmado'; break;
        case 'done': estadoEsp = 'Realizado'; break;
        case 'cancel': estadoEsp = 'Cancelado'; break;
      }
      return {
        id: o.id,
        name: o.name || 'Sin número',
        cliente: o.partner_id ? o.partner_id[1] : 'Cliente Desconocido',
        fecha: o.date_order ? new Date(o.date_order.replace(' ', 'T')).toLocaleDateString('es-CL') : 'Sin fecha',
        estado: estadoEsp,
        total: o.amount_total || 0
      };
    });

    return {
      exito: true,
      data: {
        ingresosTotales,
        presupuestosEmitidos,
        ticketPromedio,
        esteMesCount,
        tallerCorteM2,
        tallerTermoM2,
        totalManoDeObra,
        costoManoDeObra,
        insumos: {
          escuadras: totalEscuadras,
          hotmelt: totalHotmelt,
          butilo: totalButilo,
          cristalTotalM2,
          separadoresColor,
          cristalesTipo
        },
        clientesRanking,
        pedidosDetalle
      },
      clientesDisponibles
    };
  } catch (error: any) {
    console.error('Error al compilar reportes:', error);
    return { exito: false, error: error.message || 'Error al conectar con Odoo.' };
  }
}
