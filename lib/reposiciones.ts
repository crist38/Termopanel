import { odoo } from '@/lib/odoo';

// Reposiciones: piezas que se vuelven a fabricar a raíz de un ticket de Soporte al Cliente
// (helpdesk.ticket). Se guardan como adjunto JSON del ticket y sus m² se suman a la
// producción de los talleres en Reportes.

export const REPOSICION_FILE = 'reposicion_termopaneles.json';

export function productosTermopanel() {
  const termopanel = parseInt(process.env.ODOO_DEFAULT_PRODUCT_ID || '17983');
  const monolitico = parseInt(process.env.ODOO_MONOLITIC_PRODUCT_ID || process.env.ODOO_DEFAULT_PRODUCT_ID || '20193');
  return { termopanel, monolitico };
}

export interface PiezaReposicion {
  lineId: number;
  ref: string;
  // Descripción original de la línea de venta (de ahí salen cristales, separador, palillaje)
  nombre: string;
  productId: number;
  tipo: 'termopanel' | 'monolitico';
  ancho: number;
  alto: number;
  cantidadVenta: number;
  cantidad: number;
  m2: number;
}

export interface ReposicionGuardada {
  ticketId: number;
  orderId: number;
  orderName: string;
  partnerId: number | null;
  partnerName: string;
  // Fecha (YYYY-MM-DD) en que se cuenta la producción de la reposición
  fecha: string;
  motivo: string;
  items: PiezaReposicion[];
  updatedAt: string;
  updatedBy: string;
}

export function m2Pieza(ancho: number, alto: number, cantidad: number) {
  return Math.round((ancho / 1000) * (alto / 1000) * cantidad * 100) / 100;
}

/**
 * Datos de una línea de venta de termopanel o monolítico generada por el cotizador.
 * Retorna null si la línea no es de esos productos.
 */
export function parsearLineaVenta(line: any, index: number): Omit<PiezaReposicion, 'cantidad' | 'm2'> | null {
  const { termopanel, monolitico } = productosTermopanel();
  const productId = Array.isArray(line.product_id) ? line.product_id[0] : 0;
  if (productId !== termopanel && productId !== monolitico) return null;

  const nombre: string = line.name || '';
  const refMatch = nombre.match(/^\s*\[([^\]]+)\]/);
  const cantMatch = nombre.match(/Cantidad:\s*(\d+)/i);
  const cantidadVenta = cantMatch ? parseInt(cantMatch[1], 10) || 1 : 1;

  let ancho = 0;
  let alto = 0;
  const dimMatch = nombre.match(/(?:Termopanel|Cristal Monolítico)\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  if (dimMatch) {
    ancho = Math.round(parseFloat(dimMatch[1]));
    alto = Math.round(parseFloat(dimMatch[2]));
  } else {
    ancho = Math.round((line.x_studio_ancho_m || 0) * 1000);
    alto = Math.round(((line.x_studio_alto_m || 0) / cantidadVenta) * 1000);
  }

  return {
    lineId: line.id,
    ref: refMatch ? refMatch[1] : `L${index + 1}`,
    nombre,
    productId,
    tipo: productId === termopanel ? 'termopanel' : 'monolitico',
    ancho,
    alto,
    cantidadVenta,
  };
}

/**
 * Línea equivalente a una pieza repuesta, con el mismo formato que las líneas de venta,
 * para que Reportes la procese igual (m², mano de obra e insumos).
 */
export function lineaEquivalente(pieza: PiezaReposicion) {
  const nombre = /Cantidad:\s*\d+/i.test(pieza.nombre)
    ? pieza.nombre.replace(/Cantidad:\s*\d+/i, `Cantidad: ${pieza.cantidad}`)
    : `${pieza.nombre} | Cantidad: ${pieza.cantidad}`;
  return {
    id: -pieza.lineId,
    name: nombre,
    product_id: [pieza.productId, ''],
    product_uom_qty: pieza.m2,
    price_unit: 0,
    x_studio_ancho_m: pieza.ancho / 1000,
    x_studio_alto_m: (pieza.alto / 1000) * pieza.cantidad,
  };
}

function decodificar(datas: string | false): ReposicionGuardada | null {
  if (!datas) return null;
  try {
    const parsed = JSON.parse(Buffer.from(datas, 'base64').toString('utf8'));
    return Array.isArray(parsed?.items) ? parsed : null;
  } catch {
    return null;
  }
}

export async function leerReposicion(ticketId: number): Promise<{ adjuntoId: number | null; reposicion: ReposicionGuardada | null }> {
  const adjuntos = await odoo.executeKw(
    'ir.attachment',
    'search_read',
    [[['res_model', '=', 'helpdesk.ticket'], ['res_id', '=', ticketId], ['name', '=', REPOSICION_FILE]]],
    { fields: ['id', 'datas'], order: 'id desc', limit: 1 }
  );
  if (adjuntos.length === 0) return { adjuntoId: null, reposicion: null };
  return { adjuntoId: adjuntos[0].id, reposicion: decodificar(adjuntos[0].datas) };
}

export async function escribirReposicion(ticketId: number, adjuntoId: number | null, contenido: ReposicionGuardada) {
  const datas = Buffer.from(JSON.stringify(contenido, null, 2), 'utf8').toString('base64');
  if (adjuntoId) {
    await odoo.executeKw('ir.attachment', 'write', [[adjuntoId], { datas }]);
  } else {
    await odoo.executeKw('ir.attachment', 'create', [[{
      name: REPOSICION_FILE,
      type: 'binary',
      datas,
      res_model: 'helpdesk.ticket',
      res_id: ticketId,
      mimetype: 'application/json',
    }]]);
  }
}

export function ticketCancelado(stage: any): boolean {
  const nombre = Array.isArray(stage) ? String(stage[1] || '') : '';
  return /cancel/i.test(nombre);
}

/**
 * Todas las reposiciones guardadas en tickets activos y no cancelados.
 */
export async function listarReposicionesVigentes(): Promise<ReposicionGuardada[]> {
  const adjuntos = await odoo.executeKw(
    'ir.attachment',
    'search_read',
    [[['res_model', '=', 'helpdesk.ticket'], ['name', '=', REPOSICION_FILE]]],
    { fields: ['res_id', 'datas'], order: 'id desc', limit: 500 }
  );
  if (!adjuntos || adjuntos.length === 0) return [];

  const ticketIds = Array.from(new Set<number>(adjuntos.map((a: any) => a.res_id)));
  const tickets = await odoo.executeKw(
    'helpdesk.ticket',
    'search_read',
    [[['id', 'in', ticketIds]]],
    { fields: ['id', 'stage_id'] }
  );
  const vigentes = new Set<number>(tickets.filter((t: any) => !ticketCancelado(t.stage_id)).map((t: any) => t.id));

  const vistos = new Set<number>();
  const resultado: ReposicionGuardada[] = [];
  for (const a of adjuntos) {
    if (!vigentes.has(a.res_id) || vistos.has(a.res_id)) continue;
    vistos.add(a.res_id);
    const rep = decodificar(a.datas);
    if (rep) resultado.push(rep);
  }
  return resultado;
}
