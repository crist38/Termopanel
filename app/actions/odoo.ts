'use server'

import { odooCustomers, OdooCustomer, CustomerInput } from '@/lib/odoo-customers';
import { odooSales, SaleOrderLineInput, TermopanelItemData, MonoliticoItemData, OrderSearchParams } from '@/lib/odoo-sales';
import { getSession } from '@/app/actions/auth';
import { odoo } from '@/lib/odoo';


export async function buscarClientesOdoo(query: string): Promise<{ exito: boolean; data?: OdooCustomer[]; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { exito: false, error: 'No autorizado' };
    const clientes = await odooCustomers.searchCustomer(query);
    return { exito: true, data: clientes };
  } catch (error: any) {
    return { exito: false, error: error.message || 'Error al buscar clientes' };
  }
}

export async function crearClienteOdoo(data: CustomerInput): Promise<{ exito: boolean; id?: number; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { exito: false, error: 'No autorizado' };
    const clientId = await odooCustomers.getOrCreateCustomer(data);
    return { exito: true, id: clientId };
  } catch (error: any) {
    return { exito: false, error: error.message || 'Error al crear cliente' };
  }
}

export async function guardarCotizacionEnOdoo(data: {
  clientId?: number;
  clientName: string;
  obra?: string;
  fechaEntrega?: string;
  budgetNumber: number;
  items: any[];
  totalNeto: number;
  autoConfirm?: boolean;
}) {
  try {
    if (!data.clientName && !data.clientId) {
      return { exito: false, error: 'El nombre del cliente es obligatorio' };
    }

    // 1. Obtener o crear cliente en Odoo
    let clienteId = data.clientId;
    if (!clienteId) {
      clienteId = await odooCustomers.getOrCreateCustomer({
        name: data.clientName || 'Cliente sin nombre',
      });
    }
    // Si en el futuro agregas email o RUT al formulario, pásalos aquí:
    // email: data.clientEmail,
    // vat: data.clientRut
    // 2. Preparar las líneas de la cotización
    // Odoo requiere un product_id válido en cada línea para poder confirmar pedidos.
    // Se usa un producto genérico de tipo "service" configurado en la variable de entorno.
    if (!process.env.ODOO_DEFAULT_PRODUCT_ID) {
      return { exito: false, error: 'Variable de entorno ODOO_DEFAULT_PRODUCT_ID no configurada en el servidor.' };
    }
    const defaultProductId = parseInt(process.env.ODOO_DEFAULT_PRODUCT_ID);

    const lineas: SaleOrderLineInput[] = data.items.map((item, index) => {
      const extras = [];
      if (item.pulido) extras.push('Pulido');
      if (item.micropersiana) extras.push('Micropersiana');
      if (item.palillaje) {
        extras.push(`Palillaje (${item.palillajeColor || 'Blanco'}, ${item.palillajeHorizontales || 0} horizontales, ${item.palillajeVerticales || 0} verticales)`);
      }
      if (item.conForma) {
        if (item.tipoFigura) {
          const med = item.medidasFigura || {};
          let shapeDesc = '';
          if (item.tipoFigura === 'triangulo') shapeDesc = `Triángulo: Base:${med.a || 0}, Altura:${med.b || 0}`;
          else if (item.tipoFigura === 'trapecio') shapeDesc = `Trapecio: Ancho:${med.a || 0}, Alt.Izq:${med.b1 || 0}, Alt.Der:${med.b2 || 0}`;
          else if (item.tipoFigura === 'arco') shapeDesc = `Arco: Ancho:${med.a || 0}, Alt.Base:${med.b || 0}`;
          else if (item.tipoFigura === 'medio_arco') shapeDesc = `Medio Arco: Ancho:${med.a || 0}, Alt.Recta:${med.b || 0}, Alt.Total:${med.b1 || 0}`;
          else if (item.tipoFigura === 'circulo') shapeDesc = `Círculo: Diámetro:${med.a || 0}`;
          extras.push(`Con Forma (${shapeDesc})`);
        }
      }

      const itemLabel = item.label || `V${index + 1}`;

      const desc = [
        `[${itemLabel}]`,
        `Cantidad: ${item.cantidad} unidad${item.cantidad !== 1 ? 'es' : ''}`,
        `Termopanel ${item.ancho} x ${item.alto} mm`,
        `Cristal 1: ${item.cristal1.tipo} ${item.cristal1.espesor}mm`,
        `Cristal 2: ${item.cristal2.tipo} ${item.cristal2.espesor}mm`,
        `Separador: ${item.separador.espesor}mm color ${item.separador.color}`,
        ...(extras.length > 0 ? [`Extras: ${extras.join(', ')}`] : []),
      ].join(' | ');

      // Las dimensiones se envían en metros a x_studio_ancho_m y x_studio_alto_m.
      // Para que Odoo calcule la cantidad en m² correspondiente a la cantidad total de piezas
      // (ya que Odoo calcula cantidad = ancho * alto), escalamos la altura por la cantidad de piezas.
      const anchoM = item.ancho / 1000;
      const altoM = (item.alto / 1000) * item.cantidad;

      // Calculamos la cantidad redondeada a 2 decimales que computará Odoo
      const qtyRounded = Math.round(anchoM * altoM * 100) / 100;
      
      // El total de la línea es precioUnitario * cantidad
      const totalPrice = item.precioUnitario * item.cantidad;
      
      // Calculamos el precio unitario por m² tal que qtyRounded * priceUnitM2 = totalPrice
      const priceUnitM2 = qtyRounded > 0 ? Math.round(totalPrice / qtyRounded) : 0;

      return {
        product_id: defaultProductId,
        name: desc,
        product_uom_qty: qtyRounded,
        price_unit: priceUnitM2,
        x_studio_ancho_m: anchoM,
        x_studio_alto_m: altoM,
      };
    });



    // 3. Preparar datos brutos de los items para las órdenes de trabajo por taller
    const rawItems: TermopanelItemData[] = data.items.map((item, index) => ({
      label: item.label || `V${index + 1}`,
      cantidad: item.cantidad,
      ancho: item.ancho,
      alto: item.alto,
      cristal1: { tipo: item.cristal1.tipo, espesor: item.cristal1.espesor },
      cristal2: { tipo: item.cristal2.tipo, espesor: item.cristal2.espesor },
      separador: { espesor: item.separador.espesor, color: item.separador.color },
      pulido: item.pulido,
      micropersiana: item.micropersiana,
      palillaje: item.palillaje,
      palillajeColor: item.palillajeColor || 'Blanco',
      palillajeHorizontales: item.palillajeHorizontales || 0,
      palillajeVerticales: item.palillajeVerticales || 0,
      conForma: item.conForma || false,
      tipoFigura: item.tipoFigura || 'triangulo',
      medidasFigura: item.medidasFigura || { a: 0, b: 0 },
    }));

    // 4. Crear cotización, confirmarla y crear órdenes de fabricación de forma síncrona.
    // autoConfirm=true asegura que todo quede creado antes de responder al usuario.
    let finalNote = data.obra || '';
    if (data.fechaEntrega) {
      finalNote = `${finalNote}\nFecha de Entrega: ${data.fechaEntrega}`.trim();
    }

    const session = await getSession();
    const userId = session?.uid;
    const autoConfirm = data.autoConfirm !== undefined ? data.autoConfirm : false;
    const odooQuote = await odooSales.createQuote(clienteId, lineas, rawItems, autoConfirm, data.clientName, userId, finalNote);

    return { exito: true, cotizacionId: odooQuote.id, cotizacionName: odooQuote.name };
  } catch (error: any) {
    console.error('Error en Server Action Odoo:', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}

export async function guardarCotizacionMonoliticoEnOdoo(data: {
  clientId?: number;
  clientName: string;
  obra?: string;
  fechaEntrega?: string;
  budgetNumber: number;
  items: any[];
  totalNeto: number;
}) {
  try {
    if (!data.clientName && !data.clientId) {
      return { exito: false, error: 'El nombre del cliente es obligatorio' };
    }

    let clienteId = data.clientId;
    if (!clienteId) {
      clienteId = await odooCustomers.getOrCreateCustomer({ name: data.clientName || 'Cliente sin nombre' });
    }

    const monoliticoProductIdStr = process.env.ODOO_MONOLITIC_PRODUCT_ID || process.env.ODOO_DEFAULT_PRODUCT_ID;
    if (!monoliticoProductIdStr) {
      return { exito: false, error: 'Variable de entorno ODOO_MONOLITIC_PRODUCT_ID o ODOO_DEFAULT_PRODUCT_ID no configurada en el servidor.' };
    }
    const monoliticoProductId = parseInt(monoliticoProductIdStr);

    const lineas: SaleOrderLineInput[] = data.items.map((item, index) => {
      const itemLabel = item.label || `V${index + 1}`;
      const desc = `[${itemLabel}] Cantidad: ${item.cantidad} | Cristal Monolítico ${item.ancho} x ${item.alto} mm | Cristal: ${item.cristal.tipo} ${item.cristal.espesor}mm`;

      const anchoM = item.ancho / 1000;
      const altoM = (item.alto / 1000) * item.cantidad;
      const qtyRounded = Math.round(anchoM * altoM * 100) / 100;
      const totalPrice = item.precioUnitario * item.cantidad;
      const priceUnitM2 = qtyRounded > 0 ? Math.round(totalPrice / qtyRounded) : 0;

      return {
        product_id: monoliticoProductId,
        name: desc,
        product_uom_qty: qtyRounded,
        price_unit: priceUnitM2,
        x_studio_ancho_m: anchoM,
        x_studio_alto_m: altoM,
      };
    });

    const rawItems = data.items.map((item, index) => ({
      label: item.label || `V${index + 1}`,
      cantidad: item.cantidad,
      ancho: item.ancho,
      alto: item.alto,
      cristal: { tipo: item.cristal.tipo, espesor: item.cristal.espesor },
    }));

    let finalNote = data.obra || '';
    if (data.fechaEntrega) {
      finalNote = `${finalNote}\nFecha de Entrega: ${data.fechaEntrega}`.trim();
    }

    const session = await getSession();
    const userId = session?.uid;
    const odooQuote = await odooSales.createMonoliticQuote(clienteId, lineas, rawItems, false, data.clientName, userId, finalNote);
    return { exito: true, cotizacionId: odooQuote.id, cotizacionName: odooQuote.name };
  } catch (error: any) {
    console.error('Error en Server Action Odoo (Monolítico):', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}

// ─── Listado y Edición de Cotizaciones ──────────────────────────────────────

export async function listarCotizacionesOdoo(params: OrderSearchParams = {}): Promise<{
  exito: boolean;
  orders?: any[];
  total?: number;
  error?: string;
}> {
  try {
    const session = await getSession();
    if (!session) return { exito: false, error: 'No autorizado' };
    const result = await odooSales.getOrders(params);
    return { exito: true, orders: result.orders, total: result.total };
  } catch (error: any) {
    console.error('Error al listar cotizaciones Odoo:', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}

export async function obtenerDetalleCotizacion(orderId: number): Promise<{
  exito: boolean;
  order?: any;
  error?: string;
}> {
  try {
    const session = await getSession();
    if (!session) return { exito: false, error: 'No autorizado' };
    const order = await odooSales.getOrderDetail(orderId);
    if (!order) return { exito: false, error: 'Orden no encontrada' };
    return { exito: true, order };
  } catch (error: any) {
    console.error('Error al obtener detalle de cotización:', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}

export async function actualizarLineaCotizacion(
  lineId: number,
  data: { 
    price_unit?: number; 
    product_uom_qty?: number;
    name?: string;
    x_studio_ancho_m?: number;
    x_studio_alto_m?: number;
    discount?: number;
  }
): Promise<{ exito: boolean; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { exito: false, error: 'No autorizado' };
    await odooSales.updateOrderLine(lineId, data);
    return { exito: true };
  } catch (error: any) {
    console.error('Error al actualizar línea de cotización:', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}

export async function cancelarCotizacion(orderId: number): Promise<{ exito: boolean; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { exito: false, error: 'No autorizado' };
    await odooSales.cancelOrder(orderId);
    return { exito: true };
  } catch (error: any) {
    console.error('Error al cancelar cotización:', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}

// ─── Helpers de parseo de descripciones de línea ─────────────────────────────
// Reconstruyen los datos estructurados a partir del texto guardado en Odoo.

function parseTermopanelLine(name: string, idx: number): TermopanelItemData {
  const parts = name.split(' | ').map(p => p.trim());

  // Label: primera parte como "[V1]"
  const labelMatch = parts[0]?.match(/^\[([^\]]+)\]/);
  const label = labelMatch ? labelMatch[1] : `V${idx + 1}`;

  // Cantidad
  const cantPart = parts.find(p => /cantidad:/i.test(p));
  const cantidad = parseInt(cantPart?.match(/cantidad:\s*(\d+)/i)?.[1] || '1') || 1;

  // Dimensiones "Termopanel 800 x 1200 mm"
  const dimPart = parts.find(p => /^termopanel\s+\d+/i.test(p));
  const dimMatch = dimPart?.match(/(\d+)\s*x\s*(\d+)/i);
  const ancho = parseInt(dimMatch?.[1] || '0') || 0;
  const alto  = parseInt(dimMatch?.[2] || '0') || 0;

  // Cristal 1
  const c1Part  = parts.find(p => /^cristal 1:/i.test(p));
  const c1Match = c1Part?.match(/cristal 1:\s*(.+?)\s+(\d+)mm/i);
  const cristal1 = c1Match
    ? { tipo: c1Match[1].trim(), espesor: parseInt(c1Match[2]) }
    : { tipo: 'Float', espesor: 6 };

  // Cristal 2
  const c2Part  = parts.find(p => /^cristal 2:/i.test(p));
  const c2Match = c2Part?.match(/cristal 2:\s*(.+?)\s+(\d+)mm/i);
  const cristal2 = c2Match
    ? { tipo: c2Match[1].trim(), espesor: parseInt(c2Match[2]) }
    : { tipo: 'Float', espesor: 6 };

  // Separador "Separador: 12mm color Negro"
  const sepPart  = parts.find(p => /^separador:/i.test(p));
  const sepMatch = sepPart?.match(/separador:\s*(\d+)mm\s+color\s+(.+)/i);
  const separador = sepMatch
    ? { espesor: parseInt(sepMatch[1]), color: sepMatch[2].trim() }
    : { espesor: 12, color: 'Negro' };

  // Extras (opcional)
  const extrasPart = parts.find(p => /^extras:/i.test(p));
  const extrasStr  = (extrasPart || '').toLowerCase();

  const palillaje     = extrasStr.includes('palillaje');
  let palillajeColor = 'Blanco';
  let palillajeHorizontales = 0;
  let palillajeVerticales = 0;

  if (palillaje) {
    const match = extrasStr.match(/palillaje\s*\(\s*([^,)]+)\s*,\s*(?:h:\s*)?(\d+)\s*(?:horizontales)?\s*,?\s*(?:v:\s*)?(\d+)\s*(?:verticales)?/i);
    if (match) {
      const rawColor = match[1].trim();
      palillajeColor = rawColor.charAt(0).toUpperCase() + rawColor.slice(1);
      palillajeHorizontales = parseInt(match[2], 10) || 0;
      palillajeVerticales = parseInt(match[3], 10) || 0;
    }
  }

  const conForma = extrasStr.includes('con forma');
  let tipoFigura: 'triangulo' | 'trapecio' | 'arco' | 'medio_arco' | 'circulo' = 'triangulo';
  let medidasFigura: { a: number; b: number; b1?: number; b2?: number } = { a: 0, b: 0 };

  if (conForma) {
    if (extrasStr.includes('triángulo') || extrasStr.includes('triangulo')) {
      tipoFigura = 'triangulo';
      const m = extrasStr.match(/base:\s*(\d+)\s*,\s*altura:\s*(\d+)/i);
      if (m) {
        medidasFigura = { a: parseInt(m[1]), b: parseInt(m[2]) };
      }
    } else if (extrasStr.includes('trapecio')) {
      tipoFigura = 'trapecio';
      const m = extrasStr.match(/ancho:\s*(\d+)\s*,\s*alt.izq:\s*(\d+)\s*,\s*alt.der:\s*(\d+)/i);
      if (m) {
        medidasFigura = { a: parseInt(m[1]), b1: parseInt(m[2]), b2: parseInt(m[3]), b: Math.max(parseInt(m[2]), parseInt(m[3])) };
      }
    } else if (extrasStr.includes('medio arco') || extrasStr.includes('medio_arco')) {
      tipoFigura = 'medio_arco';
      const m = extrasStr.match(/ancho:\s*(\d+)\s*,\s*alt.recta:\s*(\d+)\s*,\s*alt.total:\s*(\d+)/i);
      if (m) {
        medidasFigura = { a: parseInt(m[1]), b: parseInt(m[2]), b1: parseInt(m[3]) };
      }
    } else if (extrasStr.includes('arco')) {
      tipoFigura = 'arco';
      const m = extrasStr.match(/ancho:\s*(\d+)\s*,\s*alt.base:\s*(\d+)/i);
      if (m) {
        medidasFigura = { a: parseInt(m[1]), b: parseInt(m[2]) };
      }
    } else if (extrasStr.includes('círculo') || extrasStr.includes('circulo')) {
      tipoFigura = 'circulo';
      const m = extrasStr.match(/diámetro:\s*(\d+)|diametro:\s*(\d+)/i);
      const val = m ? (m[1] || m[2]) : null;
      if (val) {
        medidasFigura = { a: parseInt(val), b: parseInt(val) };
      }
    }
  }

  return {
    label,
    cantidad,
    ancho,
    alto,
    cristal1,
    cristal2,
    separador,
    pulido:        extrasStr.includes('pulido'),
    micropersiana: extrasStr.includes('micropersiana'),
    palillaje,
    palillajeColor,
    palillajeHorizontales,
    palillajeVerticales,
    conForma,
    tipoFigura,
    medidasFigura,
  };
}

function parseMonoliticoLine(name: string, idx: number): MonoliticoItemData {
  const parts = name.split(' | ').map(p => p.trim());

  // Primera parte: "[V1] Cantidad: 2"
  const firstPart  = parts[0] || '';
  const labelMatch = firstPart.match(/^\[([^\]]+)\]/);
  const label      = labelMatch ? labelMatch[1] : `V${idx + 1}`;
  const cantMatch  = firstPart.match(/cantidad:\s*(\d+)/i);
  const cantidad   = parseInt(cantMatch?.[1] || '1') || 1;

  // Dimensiones "Cristal Monolítico 800 x 1200 mm"
  const dimPart  = parts.find(p => /cristal mon/i.test(p));
  const dimMatch = dimPart?.match(/(\d+)\s*x\s*(\d+)/i);
  const ancho    = parseInt(dimMatch?.[1] || '0') || 0;
  const alto     = parseInt(dimMatch?.[2] || '0') || 0;

  // Cristal "Cristal: Float 6mm"
  const cristalPart  = parts.find(p => /^cristal:/i.test(p));
  const cristalMatch = cristalPart?.match(/cristal:\s*(.+?)\s+(\d+)mm/i);
  const cristal = cristalMatch
    ? { tipo: cristalMatch[1].trim(), espesor: parseInt(cristalMatch[2]) }
    : { tipo: 'Float', espesor: 6 };

  return { label, cantidad, ancho, alto, cristal };
}

// ─── Confirmar Cotización y Crear Órdenes de Taller ──────────────────────────

/**
 * Confirma una cotización en estado borrador (draft → sale) y crea automáticamente
 * las órdenes de fabricación (mrp.production) y órdenes de trabajo (mrp.workorder)
 * en los talleres correspondientes, reconstruyendo los datos estructurados a partir
 * de las descripciones de texto guardadas en las líneas de la orden.
 */
export async function confirmarCotizacionOdoo(
  orderId: number
): Promise<{ exito: boolean; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { exito: false, error: 'No autorizado' };

    // 1. Obtener detalle completo de la orden
    const order = await odooSales.getOrderDetail(orderId);
    if (!order) return { exito: false, error: 'Orden no encontrada' };
    if (order.state !== 'draft') {
      return { exito: false, error: `La orden ya está en estado "${order.state}" y no puede confirmarse desde aquí.` };
    }

    const clientName = Array.isArray(order.partner_id) ? order.partner_id[1] : '';

    // 2. Filtrar líneas de producto (excluir notas y secciones)
    const productOrderLines = order.order_line.filter(
      l => !l.display_type && l.product_id && l.product_uom_qty > 0
    );

    // 3. Confirmar la orden en Odoo
    await odooSales.confirmOrder(orderId);

    // Si no hay líneas parseables, confirmamos sin crear OTs
    if (productOrderLines.length === 0) {
      return { exito: true };
    }

    // 4. Determinar tipo (termopanel vs monolítico) por contenido de la primera línea
    const firstLineName = productOrderLines[0]?.name || '';
    const isMonolitico  = /monol[íi]tico/i.test(firstLineName);

    // 5. Reconstruir SaleOrderLineInput[] desde las líneas de Odoo
    const lines: SaleOrderLineInput[] = productOrderLines.map(line => ({
      product_id:      Array.isArray(line.product_id) ? (line.product_id as [number, string])[0] : undefined,
      name:            line.name,
      product_uom_qty: line.product_uom_qty,
      price_unit:      line.price_unit,
    }));

    // 6. Parsear y crear órdenes de fabricación y trabajo según el tipo
    if (isMonolitico) {
      const rawItems: MonoliticoItemData[] = productOrderLines.map((line, i) =>
        parseMonoliticoLine(line.name, i)
      );
      await odooSales.createMonoliticManufacturingOrders(orderId, lines, rawItems, clientName);
    } else {
      const rawItems: TermopanelItemData[] = productOrderLines.map((line, i) =>
        parseTermopanelLine(line.name, i)
      );
      await odooSales.createManufacturingOrders(orderId, lines, rawItems, clientName);
    }

    return { exito: true };
  } catch (error: any) {
    console.error('Error al confirmar cotización en Odoo:', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}

export async function actualizarClienteCotizacion(
  orderId: number,
  partnerId: number
): Promise<{ exito: boolean; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { exito: false, error: 'No autorizado' };

    await odoo.executeKw('sale.order', 'write', [[orderId], { partner_id: partnerId }]);
    return { exito: true };
  } catch (error: any) {
    console.error('Error al actualizar cliente de cotización en Odoo:', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}

function stripHtml(htmlStr: string) {
  if (!htmlStr) return "";
  let text = htmlStr
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n');
  return text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

export async function obtenerCotizacionParaEditar(orderId: number): Promise<{
  exito: boolean;
  tipo?: 'termopanel' | 'monolitico' | 'formas';
  clientName?: string;
  clientId?: number;
  obra?: string;
  fechaEntrega?: string;
  budgetName?: string;
  items?: any[];
  error?: string;
}> {
  try {
    const session = await getSession();
    if (!session) return { exito: false, error: 'No autorizado' };

    const order = await odooSales.getOrderDetail(orderId);
    if (!order) return { exito: false, error: 'Cotización no encontrada' };

    if (order.state !== 'draft') {
      return { exito: false, error: 'Solo se pueden editar cotizaciones en estado borrador.' };
    }

    const productOrderLines = order.order_line.filter(
      (l: any) => !l.display_type && l.product_id && l.product_uom_qty > 0
    );

    const clientName = Array.isArray(order.partner_id) ? order.partner_id[1] : '';
    const clientId = Array.isArray(order.partner_id) ? order.partner_id[0] : undefined;
    
    const fullNote = order.note ? stripHtml(order.note) : '';
    let obra = fullNote;
    let fechaEntrega = '';
    const match = fullNote.match(/Fecha de Entrega:\s*(.*)$/im);
    if (match) {
      fechaEntrega = match[1].trim();
      obra = fullNote.replace(/Fecha de Entrega:\s*(.*)$/im, '').trim();
    }
    const budgetName = order.name || `SO${orderId}`;

    if (productOrderLines.length === 0) {
      return {
        exito: true,
        tipo: 'termopanel',
        clientName,
        clientId,
        obra,
        fechaEntrega,
        budgetName,
        items: []
      };
    }

    const firstLineName = productOrderLines[0]?.name || '';
    const isMonolitico = /monol[íi]tico/i.test(firstLineName);
    const isFormas = productOrderLines.some((l: any) => /con forma/i.test(l.name || ''));

    let tipo: 'termopanel' | 'monolitico' | 'formas' = 'termopanel';
    if (isMonolitico) {
      tipo = 'monolitico';
    } else if (isFormas) {
      tipo = 'formas';
    }

    // Parse items
    let items: any[] = [];
    if (isMonolitico) {
      items = productOrderLines.map((line: any, i: number) => {
        const parsed = parseMonoliticoLine(line.name, i);
        const qty = parsed.cantidad || 1;
        const precioUnitario = Math.round(line.price_subtotal / qty);
        
        return {
          id: Math.random().toString(36).substring(2, 15),
          ...parsed,
          precioUnitario
        };
      });
    } else {
      items = productOrderLines.map((line: any, i: number) => {
        const parsed = parseTermopanelLine(line.name, i);
        const qty = parsed.cantidad || 1;
        const precioUnitario = Math.round(line.price_subtotal / qty);

        return {
          id: Math.random().toString(36).substring(2, 15),
          ...parsed,
          precioUnitario
        };
      });
    }

    return {
      exito: true,
      tipo,
      clientName,
      clientId,
      obra,
      fechaEntrega,
      budgetName,
      items
    };
  } catch (error: any) {
    console.error('Error al obtener cotización para editar:', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}

export async function actualizarCotizacionEnOdoo(data: {
  orderId: number;
  clientId?: number;
  clientName: string;
  obra?: string;
  fechaEntrega?: string;
  items: any[];
  totalNeto: number;
  isMonolitico?: boolean;
  autoConfirm?: boolean;
}): Promise<{ exito: boolean; cotizacionName?: string; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { exito: false, error: 'No autorizado' };

    // 1. Obtener o crear cliente en Odoo
    let clienteId = data.clientId;
    if (!clienteId) {
      clienteId = await odooCustomers.getOrCreateCustomer({
        name: data.clientName || 'Cliente sin nombre',
      });
    }

    // 2. Preparar las nuevas líneas de cotización
    const defaultProductId = parseInt(process.env.ODOO_DEFAULT_PRODUCT_ID || '0');
    const monoliticoProductId = parseInt(process.env.ODOO_MONOLITIC_PRODUCT_ID || process.env.ODOO_DEFAULT_PRODUCT_ID || '0');
    const productId = data.isMonolitico ? monoliticoProductId : defaultProductId;

    if (!productId) {
      return { exito: false, error: 'Variable de entorno ODOO_DEFAULT_PRODUCT_ID o ODOO_MONOLITIC_PRODUCT_ID no configurada en el servidor.' };
    }

    const lineas = data.items.map((item, index) => {
      const itemLabel = item.label || `V${index + 1}`;
      
      let desc = '';
      if (data.isMonolitico) {
        desc = `[${itemLabel}] Cantidad: ${item.cantidad} | Cristal Monolítico ${item.ancho} x ${item.alto} mm | Cristal: ${item.cristal.tipo} ${item.cristal.espesor}mm`;
      } else {
        const extras = [];
        if (item.pulido) extras.push('Pulido');
        if (item.micropersiana) extras.push('Micropersiana');
        if (item.palillaje) {
          extras.push(`Palillaje (${item.palillajeColor || 'Blanco'}, ${item.palillajeHorizontales || 0} horizontales, ${item.palillajeVerticales || 0} verticales)`);
        }
        if (item.conForma) {
          if (item.tipoFigura) {
            const med = item.medidasFigura || {};
            let shapeDesc = '';
            if (item.tipoFigura === 'triangulo') shapeDesc = `Triángulo: Base:${med.a || 0}, Altura:${med.b || 0}`;
            else if (item.tipoFigura === 'trapecio') shapeDesc = `Trapecio: Ancho:${med.a || 0}, Alt.Izq:${med.b1 || 0}, Alt.Der:${med.b2 || 0}`;
            else if (item.tipoFigura === 'arco') shapeDesc = `Arco: Ancho:${med.a || 0}, Alt.Base:${med.b || 0}`;
            else if (item.tipoFigura === 'medio_arco') shapeDesc = `Medio Arco: Ancho:${med.a || 0}, Alt.Recta:${med.b || 0}, Alt.Total:${med.b1 || 0}`;
            else if (item.tipoFigura === 'circulo') shapeDesc = `Círculo: Diámetro:${med.a || 0}`;
            extras.push(`Con Forma (${shapeDesc})`);
          }
        }

        desc = [
          `[${itemLabel}]`,
          `Cantidad: ${item.cantidad} unidad${item.cantidad !== 1 ? 'es' : ''}`,
          `Termopanel ${item.ancho} x ${item.alto} mm`,
          `Cristal 1: ${item.cristal1.tipo} ${item.cristal1.espesor}mm`,
          `Cristal 2: ${item.cristal2.tipo} ${item.cristal2.espesor}mm`,
          `Separador: ${item.separador.espesor}mm color ${item.separador.color}`,
          ...(extras.length > 0 ? [`Extras: ${extras.join(', ')}`] : []),
        ].join(' | ');
      }

      const anchoM = item.ancho / 1000;
      const altoM = (item.alto / 1000) * item.cantidad;
      const qtyRounded = Math.round(anchoM * altoM * 100) / 100;
      const totalPrice = item.precioUnitario * item.cantidad;
      const priceUnitM2 = qtyRounded > 0 ? Math.round(totalPrice / qtyRounded) : 0;

      return {
        product_id: productId,
        name: desc,
        product_uom_qty: qtyRounded,
        price_unit: priceUnitM2,
        x_studio_ancho_m: anchoM,
        x_studio_alto_m: altoM,
      };
    });

    // 3. Ejecutar la actualización en Odoo
    const orderLinesTuples = [
      [5, 0, 0],
      ...lineas.map(line => [0, 0, {
        product_id: line.product_id || false,
        name: line.name,
        product_uom_qty: line.product_uom_qty,
        product_uom_id: 1,
        price_unit: line.price_unit,
        ...(line.x_studio_ancho_m !== undefined && { x_studio_ancho_m: line.x_studio_ancho_m }),
        ...(line.x_studio_alto_m !== undefined && { x_studio_alto_m: line.x_studio_alto_m }),
      }])
    ];

    let finalNote = data.obra || '';
    if (data.fechaEntrega) {
      finalNote = `${finalNote}\nFecha de Entrega: ${data.fechaEntrega}`.trim();
    }

    const orderData: any = {
      partner_id: clienteId,
      order_line: orderLinesTuples,
      note: finalNote,
    };

    await odoo.executeKw('sale.order', 'write', [[data.orderId], orderData]);
    
    // Forzar precio unitario correcto (Odoo puede sobreescribirlo)
    await odooSales.forceLinePrices(data.orderId, lineas);

    // Obtener el nombre de la cotización para retornarlo
    const orderDataResp = await odoo.executeKw('sale.order', 'search_read', [[['id', '=', data.orderId]]], { fields: ['name'], limit: 1 });
    const orderName = orderDataResp.length > 0 ? orderDataResp[0].name : `SO${data.orderId}`;

    if (data.autoConfirm) {
      await odooSales.confirmOrder(data.orderId);
      const rawItems = data.items.map((item, index) => ({
        label: item.label || `V${index + 1}`,
        cantidad: item.cantidad,
        ancho: item.ancho,
        alto: item.alto,
        cristal1: item.cristal1 ? { tipo: item.cristal1.tipo, espesor: item.cristal1.espesor } : { tipo: '', espesor: 0 },
        cristal2: item.cristal2 ? { tipo: item.cristal2.tipo, espesor: item.cristal2.espesor } : { tipo: '', espesor: 0 },
        separador: item.separador ? { espesor: item.separador.espesor, color: item.separador.color } : { espesor: 0, color: '' },
        pulido: item.pulido,
        micropersiana: item.micropersiana,
        palillaje: item.palillaje,
        palillajeColor: item.palillajeColor || 'Blanco',
        palillajeHorizontales: item.palillajeHorizontales || 0,
        palillajeVerticales: item.palillajeVerticales || 0,
        conForma: item.conForma || false,
        tipoFigura: item.tipoFigura || 'triangulo',
        medidasFigura: item.medidasFigura || { a: 0, b: 0 },
      }));
      try {
        await odooSales.createManufacturingOrders(data.orderId, lineas, rawItems, data.clientName);
      } catch (err) {
        console.error("Error creating manufacturing orders during update:", err);
      }
    }

    return { exito: true, cotizacionName: orderName };
  } catch (error: any) {
    console.error('Error al actualizar cotización en Odoo:', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}
