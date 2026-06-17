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
    separadoresColor: Record<string, { neto: number; real: number }>;
    cristalesTipo: Record<string, { neto: number; real: number }>;
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

function calcularConsumoSeparadorReal(ancho: number, alto: number, cantidad: number): { netoMl: number; realMl: number } {
  const stripLength = 5000; // 5000 mm (5 metros)
  const netoMl = (2 * (ancho + alto) / 1000) * cantidad;
  
  if (ancho <= 0 || alto <= 0 || cantidad <= 0) {
    return { netoMl: 0, realMl: 0 };
  }

  // Si alguna dimensión excede 5000mm, no se puede optimizar, retornamos perimetro neto
  if (ancho > stripLength || alto > stripLength) {
    return { netoMl, realMl: netoMl };
  }

  const pieces: number[] = [];
  for (let i = 0; i < cantidad; i++) {
    pieces.push(ancho, ancho, alto, alto);
  }
  
  // FFD: First Fit Decreasing
  pieces.sort((a, b) => b - a);
  const strips: number[][] = [];
  
  for (const piece of pieces) {
    let placed = false;
    for (const strip of strips) {
      const used = strip.reduce((sum, v) => sum + v, 0);
      if (stripLength - used >= piece) {
        strip.push(piece);
        placed = true;
        break;
      }
    }
    if (!placed) {
      strips.push([piece]);
    }
  }
  
  const realMl = strips.length * 5; // cada tira usada son 5 metros
  return { netoMl, realMl };
}

function calcularConsumoVidrioReal(
  pieces: Array<{ width: number; height: number; qty: number }>,
  sheetW: number = 1800,
  sheetH: number = 2500
): { netoM2: number; realM2: number } {
  let netoM2 = 0;
  const flatPieces: Array<{ w: number; h: number }> = [];

  for (const p of pieces) {
    const w = p.width;
    const h = p.height;
    const qty = p.qty || 1;
    if (w <= 0 || h <= 0 || qty <= 0) continue;
    
    const areaPiece = (w * h / 1000000) * qty;
    netoM2 += areaPiece;

    for (let i = 0; i < qty; i++) {
      const side1 = Math.min(w, h);
      const side2 = Math.max(w, h);
      flatPieces.push({ w: side1, h: side2 });
    }
  }

  if (flatPieces.length === 0) {
    return { netoM2: 0, realM2: 0 };
  }

  flatPieces.sort((a, b) => b.h - a.h);

  interface Shelf {
    y: number;
    height: number;
    usedWidth: number;
  }

  interface Sheet {
    shelves: Shelf[];
    totalHeightUsed: number;
  }

  const sheets: Sheet[] = [];

  for (const piece of flatPieces) {
    let placed = false;

    for (const sheet of sheets) {
      for (const shelf of sheet.shelves) {
        if (shelf.usedWidth + piece.w <= sheetW && piece.h <= shelf.height) {
          shelf.usedWidth += piece.w;
          placed = true;
          break;
        }
        if (shelf.usedWidth + piece.h <= sheetW && piece.w <= shelf.height) {
          shelf.usedWidth += piece.h;
          placed = true;
          break;
        }
      }
      if (placed) break;

      if (sheet.totalHeightUsed + piece.h <= sheetH && piece.w <= sheetW) {
        const newShelf: Shelf = {
          y: sheet.totalHeightUsed,
          height: piece.h,
          usedWidth: piece.w
        };
        sheet.shelves.push(newShelf);
        sheet.totalHeightUsed += piece.h;
        placed = true;
        break;
      }
      if (sheet.totalHeightUsed + piece.w <= sheetH && piece.h <= sheetW) {
        const newShelf: Shelf = {
          y: sheet.totalHeightUsed,
          height: piece.w,
          usedWidth: piece.h
        };
        sheet.shelves.push(newShelf);
        sheet.totalHeightUsed += piece.w;
        placed = true;
        break;
      }
    }

    if (!placed) {
      const sheet: Sheet = {
        shelves: [],
        totalHeightUsed: 0
      };
      
      if (piece.h <= sheetH && piece.w <= sheetW) {
        const newShelf: Shelf = {
          y: 0,
          height: piece.h,
          usedWidth: piece.w
        };
        sheet.shelves.push(newShelf);
        sheet.totalHeightUsed = piece.h;
        sheets.push(sheet);
        placed = true;
      } else if (piece.w <= sheetH && piece.h <= sheetW) {
        const newShelf: Shelf = {
          y: 0,
          height: piece.w,
          usedWidth: piece.h
        };
        sheet.shelves.push(newShelf);
        sheet.totalHeightUsed = piece.w;
        sheets.push(sheet);
        placed = true;
      } else {
        netoM2 += (piece.w * piece.h) / 1000000;
      }
    }
  }

  const sheetAreaM2 = (sheetW * sheetH) / 1000000;
  const realM2 = sheets.length * sheetAreaM2;

  return { netoM2, realM2: Math.max(realM2, netoM2) };
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
    const separadoresColor: Record<string, { neto: number; real: number }> = {};
    const cristalesPiezas: Record<string, Array<{ width: number; height: number; qty: number }>> = {};

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
        tallerCorteM2 += areaM2 * 2;
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
          
          const sepConsumo = calcularConsumoSeparadorReal(ancho, alto, cantidad);
          if (!separadoresColor[key]) {
            separadoresColor[key] = { neto: 0, real: 0 };
          }
          separadoresColor[key].neto += sepConsumo.netoMl;
          separadoresColor[key].real += sepConsumo.realMl;
        }

        // Cristales del termopanel (Cristal 1 y Cristal 2)
        const c1Match = name.match(/Cristal 1:\s*([^0-9|]+)\s*(\d+)mm/i);
        if (c1Match) {
          const key = `Cristal ${c1Match[1].trim()} ${c1Match[2]}mm`;
          if (!cristalesPiezas[key]) cristalesPiezas[key] = [];
          cristalesPiezas[key].push({ width: ancho, height: alto, qty: cantidad });
        }
        const c2Match = name.match(/Cristal 2:\s*([^0-9|]+)\s*(\d+)mm/i);
        if (c2Match) {
          const key = `Cristal ${c2Match[1].trim()} ${c2Match[2]}mm`;
          if (!cristalesPiezas[key]) cristalesPiezas[key] = [];
          cristalesPiezas[key].push({ width: ancho, height: alto, qty: cantidad });
        }
      } else if (isMonolitico) {
        tallerCorteM2 += areaM2;

        // Cristal monolítico (solo uno)
        const cMatch = name.match(/Cristal:\s*([^0-9|]+)\s*(\d+)mm/i);
        if (cMatch) {
          const key = `Cristal ${cMatch[1].trim()} ${cMatch[2]}mm`;
          if (!cristalesPiezas[key]) cristalesPiezas[key] = [];
          cristalesPiezas[key].push({ width: ancho, height: alto, qty: cantidad });
        }
      }
    });

    const cristalesTipo: Record<string, { neto: number; real: number }> = {};
    Object.entries(cristalesPiezas).forEach(([key, pieces]) => {
      const consumo = calcularConsumoVidrioReal(pieces, 1800, 2500); // planchas de 1800 x 2500 mm
      cristalesTipo[key] = {
        neto: consumo.netoM2,
        real: consumo.realM2
      };
    });

    const cristalTotalM2 = Object.values(cristalesTipo).reduce((sum, v) => sum + v.real, 0);

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
