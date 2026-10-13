'use server'

import { odoo } from '@/lib/odoo';
import { odooSales, OrderSearchParams, SaleOrderLineInput, TermopanelItemData } from '@/lib/odoo-sales';
import { getSession } from '@/app/actions/auth';
import { EnvioFabricacion, FiguraFabricacion, MedidaFabricacion, MedidasGuardadas, describirFigura, describirExtras } from '@/lib/types/fabricacion';

// Etiqueta de Odoo de las cotizaciones de obra completa (ventanas + termopaneles)
const PVC_TAG_NAME = process.env.ODOO_PVC_TAG_NAME || 'Taller PVC';
// Adjunto de la orden de venta donde se guardan las medidas para poder volver a editarlas
const MEDIDAS_FILE = 'medidas_termopaneles.json';

function escapeHtml(text: string) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function esCotizacionPvc(orderId: number): Promise<boolean> {
  const tagId = await odooSales.getTagIdByName(PVC_TAG_NAME);
  if (!tagId) return false;
  const count = await odoo.executeKw('sale.order', 'search_count', [
    [['id', '=', orderId], ['tag_ids', 'in', [tagId]]],
  ]);
  return count > 0;
}

// Lee el adjunto de medidas de la orden. `medidas` es null si no existe o no se puede leer.
async function leerMedidas(orderId: number): Promise<{ adjuntoId: number | null; medidas: MedidasGuardadas | null }> {
  const adjuntos = await odoo.executeKw(
    'ir.attachment',
    'search_read',
    [[['res_model', '=', 'sale.order'], ['res_id', '=', orderId], ['name', '=', MEDIDAS_FILE]]],
    { fields: ['id', 'datas'], order: 'id desc', limit: 1 }
  );
  if (adjuntos.length === 0) return { adjuntoId: null, medidas: null };

  let medidas: MedidasGuardadas | null = null;
  if (adjuntos[0].datas) {
    try {
      const parsed = JSON.parse(Buffer.from(adjuntos[0].datas, 'base64').toString('utf8'));
      if (Array.isArray(parsed?.items)) medidas = parsed;
    } catch {
      // Adjunto ilegible
    }
  }
  return { adjuntoId: adjuntos[0].id, medidas };
}

async function escribirMedidas(orderId: number, adjuntoId: number | null, contenido: MedidasGuardadas) {
  const datas = Buffer.from(JSON.stringify(contenido, null, 2), 'utf8').toString('base64');
  if (adjuntoId) {
    await odoo.executeKw('ir.attachment', 'write', [[adjuntoId], { datas }]);
  } else {
    await odoo.executeKw('ir.attachment', 'create', [[{
      name: MEDIDAS_FILE,
      type: 'binary',
      datas,
      res_model: 'sale.order',
      res_id: orderId,
      mimetype: 'application/json',
    }]]);
  }
}

function limpiarMedidas(items: MedidaFabricacion[]): MedidaFabricacion[] {
  const entero = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  return items.map((item, i) => ({
    ref: String(item.ref || `V${i + 1}`).trim().slice(0, 40),
    cantidad: Math.max(1, entero(item.cantidad)),
    ancho: entero(item.ancho),
    alto: entero(item.alto),
    cristal1: { tipo: String(item.cristal1?.tipo || 'Incoloro'), espesor: entero(item.cristal1?.espesor) },
    cristal2: { tipo: String(item.cristal2?.tipo || 'Incoloro'), espesor: entero(item.cristal2?.espesor) },
    separador: { espesor: entero(item.separador?.espesor), color: String(item.separador?.color || 'Mate') },
    pulido: !!item.pulido,
    micropersiana: !!item.micropersiana,
    palillaje: !!item.palillaje,
    palillajeColor: String(item.palillajeColor || 'Blanco').slice(0, 30),
    palillajeHorizontales: entero(item.palillajeHorizontales),
    palillajeVerticales: entero(item.palillajeVerticales),
    ...limpiarFigura(item, entero),
    observacion: String(item.observacion || '').trim().slice(0, 200),
  }));
}

const FIGURAS: FiguraFabricacion[] = ['rectangulo', 'triangulo', 'trapecio', 'arco', 'medio_arco', 'circulo', 'personalizada'];

function limpiarFigura(
  item: MedidaFabricacion,
  entero: (v: unknown) => number
): Pick<MedidaFabricacion, 'tipoFigura' | 'medidasFigura'> {
  const tipoFigura = FIGURAS.includes(item.tipoFigura as FiguraFabricacion) ? item.tipoFigura! : 'rectangulo';
  const med = item.medidasFigura;
  if (tipoFigura === 'rectangulo' || !med) return { tipoFigura: 'rectangulo' };
  const puntos = Array.isArray(med.puntos)
    ? med.puntos.slice(0, 200).map(p => ({ x: entero(p?.x), y: entero(p?.y) }))
    : undefined;
  // Una forma libre sin puntos suficientes no se puede fabricar: se trata como rectángulo
  if (tipoFigura === 'personalizada' && (!puntos || puntos.length < 3)) return { tipoFigura: 'rectangulo' };
  return {
    tipoFigura,
    medidasFigura: {
      a: entero(med.a),
      b: entero(med.b),
      ...(med.b1 !== undefined && { b1: entero(med.b1) }),
      ...(med.b2 !== undefined && { b2: entero(med.b2) }),
      ...(med.r !== undefined && { r: entero(med.r) }),
      ...(tipoFigura === 'personalizada' && { puntos }),
    },
  };
}

function notaMedidasHtml(items: MedidaFabricacion[], autor: string) {
  const td = 'style="border:1px solid #ccc;padding:3px 8px;"';
  const filas = items.map(item => {
    const m2 = (item.ancho / 1000) * (item.alto / 1000) * item.cantidad;
    return `<tr>` +
      `<td ${td}>${escapeHtml(item.ref)}</td>` +
      `<td ${td}>${item.cantidad}</td>` +
      `<td ${td}><b>${item.ancho} x ${item.alto}</b></td>` +
      `<td ${td}>${escapeHtml(item.cristal1.tipo)} ${item.cristal1.espesor}mm</td>` +
      `<td ${td}>${escapeHtml(item.cristal2.tipo)} ${item.cristal2.espesor}mm</td>` +
      `<td ${td}>${item.separador.espesor}mm ${escapeHtml(item.separador.color)}</td>` +
      `<td ${td}>${m2.toFixed(2)}</td>` +
      `<td ${td}>${escapeHtml([describirFigura(item), ...describirExtras(item), item.observacion || ''].filter(Boolean).join(' | '))}</td>` +
      `</tr>`;
  }).join('');
  const totalUnidades = items.reduce((s, i) => s + i.cantidad, 0);
  const totalM2 = items.reduce((s, i) => s + (i.ancho / 1000) * (i.alto / 1000) * i.cantidad, 0);
  const cabecera = ['Ref', 'Cant.', 'Medida (mm)', 'Cristal 1', 'Cristal 2', 'Separador', 'm²', 'Figura / Extras / Obs.']
    .map(t => `<th ${td}>${t}</th>`).join('');

  return `<p><b>📐 Medidas de termopaneles para fabricación</b> (${escapeHtml(autor)})</p>` +
    `<table style="border-collapse:collapse;"><thead><tr>${cabecera}</tr></thead><tbody>${filas}</tbody></table>` +
    `<p><b>Total:</b> ${totalUnidades} termopanel${totalUnidades !== 1 ? 'es' : ''} — ${totalM2.toFixed(2)} m²</p>`;
}

/**
 * Lista las cotizaciones con la etiqueta de Taller PVC, indicando cuáles ya tienen medidas adjuntas.
 */
export async function listarCotizacionesFabricacion(params: OrderSearchParams = {}): Promise<{
  exito: boolean;
  orders?: any[];
  total?: number;
  error?: string;
}> {
  try {
    const session = await getSession();
    if (!session) return { exito: false, error: 'No autorizado' };

    const tagId = await odooSales.getTagIdByName(PVC_TAG_NAME);
    if (!tagId) return { exito: false, error: `No existe la etiqueta "${PVC_TAG_NAME}" en Odoo.` };

    const result = await odooSales.getOrders({ ...params, tagName: PVC_TAG_NAME });

    const ids = result.orders.map(o => o.id);
    let conMedidas = new Set<number>();
    if (ids.length > 0) {
      const adjuntos = await odoo.executeKw(
        'ir.attachment',
        'search_read',
        [[['res_model', '=', 'sale.order'], ['res_id', 'in', ids], ['name', '=', MEDIDAS_FILE]]],
        { fields: ['res_id'] }
      );
      conMedidas = new Set(adjuntos.map((a: any) => a.res_id));
    }

    const orders = result.orders.map(o => ({ ...o, tieneMedidas: conMedidas.has(o.id) }));
    return { exito: true, orders, total: result.total };
  } catch (error: any) {
    console.error('Error al listar cotizaciones de fabricación:', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Obtiene el detalle de una cotización de Taller PVC junto con las medidas ya adjuntas (si las hay).
 */
export async function obtenerMedidasFabricacion(orderId: number): Promise<{
  exito: boolean;
  order?: any;
  medidas?: MedidasGuardadas;
  error?: string;
}> {
  try {
    const session = await getSession();
    if (!session) return { exito: false, error: 'No autorizado' };
    if (!(await esCotizacionPvc(orderId))) {
      return { exito: false, error: `La cotización no tiene la etiqueta "${PVC_TAG_NAME}".` };
    }

    const order = await odooSales.getOrderDetail(orderId);
    if (!order) return { exito: false, error: 'Cotización no encontrada' };

    const guardado = await leerMedidas(orderId);
    return { exito: true, order, medidas: guardado.medidas ?? { items: [] } };
  } catch (error: any) {
    console.error('Error al obtener medidas de fabricación:', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Adjunta las medidas de los termopaneles a la cotización de Taller PVC:
 * guarda el archivo de medidas en la orden y publica una nota con la tabla en su historial.
 * No modifica líneas ni precios de la cotización.
 */
export async function guardarMedidasFabricacion(
  orderId: number,
  items: MedidaFabricacion[]
): Promise<{ exito: boolean; aviso?: string; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { exito: false, error: 'No autorizado' };
    if (!(await esCotizacionPvc(orderId))) {
      return { exito: false, error: `La cotización no tiene la etiqueta "${PVC_TAG_NAME}".` };
    }

    const medidas = limpiarMedidas(items || []);
    if (medidas.length === 0) return { exito: false, error: 'Agrega al menos una medida.' };
    const incompleta = medidas.find(m => m.ancho <= 0 || m.alto <= 0);
    if (incompleta) {
      return { exito: false, error: `La medida de "${incompleta.ref}" no tiene ancho y alto válidos.` };
    }

    const guardado = await leerMedidas(orderId);
    const contenido: MedidasGuardadas = {
      items: medidas,
      updatedAt: new Date().toISOString(),
      updatedBy: session.email,
      // Conservar el registro del envío a fabricación, si ya se hizo
      ...(guardado.medidas?.fabricacion && { fabricacion: guardado.medidas.fabricacion }),
    };
    await escribirMedidas(orderId, guardado.adjuntoId, contenido);

    // La nota es solo informativa: si falla, las medidas ya quedaron guardadas
    try {
      await odoo.executeKw('sale.order', 'message_post', [[orderId]], {
        body: notaMedidasHtml(medidas, session.email),
        body_is_html: true,
        message_type: 'comment',
        subtype_xmlid: 'mail.mt_note',
      });
    } catch (e: any) {
      console.error('Error al publicar la nota de medidas en la SO:', e);
      return { exito: true, aviso: 'Las medidas se guardaron, pero no se pudo publicar la nota en el historial de Odoo.' };
    }

    return { exito: true };
  } catch (error: any) {
    console.error('Error al guardar medidas de fabricación:', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Crea en Odoo las órdenes de fabricación y de trabajo (Taller Corte Vidrio y Taller Termopaneles)
 * a partir de las medidas ya adjuntas a la cotización de Taller PVC.
 * Usa siempre las medidas guardadas, para que lo fabricado coincida con lo adjunto.
 * Si ya se había enviado, solo se repite con `reenviar` (crea órdenes nuevas, no reemplaza las anteriores).
 */
export async function enviarAFabricacion(
  orderId: number,
  reenviar = false
): Promise<{ exito: boolean; fabricacion?: EnvioFabricacion; aviso?: string; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { exito: false, error: 'No autorizado' };
    if (!(await esCotizacionPvc(orderId))) {
      return { exito: false, error: `La cotización no tiene la etiqueta "${PVC_TAG_NAME}".` };
    }

    const orders = await odoo.executeKw('sale.order', 'read', [[orderId]], { fields: ['name', 'state', 'partner_id'] });
    if (!orders || orders.length === 0) return { exito: false, error: 'Cotización no encontrada' };
    const order = orders[0];
    if (order.state !== 'sale' && order.state !== 'done') {
      return { exito: false, error: 'La cotización debe estar confirmada en Odoo antes de enviarla a fabricación.' };
    }

    const guardado = await leerMedidas(orderId);
    const medidas = limpiarMedidas(guardado.medidas?.items ?? []);
    if (!guardado.medidas || medidas.length === 0) {
      return { exito: false, error: 'Primero adjunta las medidas a la cotización.' };
    }
    if (medidas.some(m => m.ancho <= 0 || m.alto <= 0)) {
      return { exito: false, error: 'Hay medidas guardadas sin ancho o alto válidos.' };
    }
    if (guardado.medidas.fabricacion && !reenviar) {
      return { exito: false, error: 'Esta cotización ya fue enviada a fabricación.' };
    }

    const productId = parseInt(process.env.ODOO_DEFAULT_PRODUCT_ID || '17983');
    const clientName = Array.isArray(order.partner_id) ? order.partner_id[1] : '';

    // Una orden de fabricación por medida, con la cantidad en m² como en el cotizador de termopaneles
    const lineas: SaleOrderLineInput[] = medidas.map(m => ({
      product_id: productId,
      name: `[${m.ref}] Termopanel ${m.ancho} x ${m.alto} mm`,
      product_uom_qty: Math.max(0.01, Math.round((m.ancho / 1000) * (m.alto / 1000) * m.cantidad * 100) / 100),
      price_unit: 0,
    }));
    const rawItems: TermopanelItemData[] = medidas.map(m => ({
      label: m.ref,
      cantidad: m.cantidad,
      ancho: m.ancho,
      alto: m.alto,
      cristal1: m.cristal1,
      cristal2: m.cristal2,
      separador: m.separador,
      pulido: !!m.pulido,
      micropersiana: !!m.micropersiana,
      palillaje: !!m.palillaje,
      palillajeColor: m.palillajeColor,
      palillajeHorizontales: m.palillajeHorizontales,
      palillajeVerticales: m.palillajeVerticales,
      ...(m.tipoFigura && m.tipoFigura !== 'rectangulo' && {
        conForma: true,
        tipoFigura: m.tipoFigura,
        medidasFigura: m.medidasFigura,
      }),
    }));

    const moIds = await odooSales.createManufacturingOrders(orderId, lineas, rawItems, clientName, order.name);

    const fabricacion: EnvioFabricacion = {
      enviadoAt: new Date().toISOString(),
      enviadoPor: session.email,
      moIds: [...(guardado.medidas.fabricacion?.moIds ?? []), ...moIds],
    };

    // Las órdenes ya existen en Odoo: si falla el registro, avisar para no enviarlas dos veces
    try {
      await escribirMedidas(orderId, guardado.adjuntoId, { ...guardado.medidas, fabricacion });
    } catch (e: any) {
      console.error('Error al registrar el envío a fabricación:', e);
      return {
        exito: true,
        fabricacion,
        aviso: 'Las órdenes de fabricación se crearon, pero no se pudo registrar el envío en la cotización. No la envíes de nuevo.',
      };
    }

    return { exito: true, fabricacion };
  } catch (error: any) {
    console.error('Error al enviar a fabricación:', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}
