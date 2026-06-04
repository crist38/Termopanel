import { odoo } from './odoo';

/**
 * Interface básica para representar una Cotización / Orden de Venta
 */
export interface SaleOrder {
  id: number;
  name: string;
  partner_id: [number, string]; // [ID, Name]
  state: string;
  amount_total: number;
  date_order: string;
}

/**
 * Interface para crear una línea de pedido
 */
export interface SaleOrderLineInput {
  product_id?: number;
  name: string;
  product_uom_qty: number; // Cantidad en m2 (total_area) o piezas
  price_unit: number;      // Precio unitario
  is_note?: boolean;
  x_studio_ancho_m?: number;
  x_studio_alto_m?: number;
}

export class OdooSalesService {
  /**
   * Obtiene las cotizaciones/órdenes más recientes
   * @param limit Cantidad de registros a traer (por defecto 10)
   */
  async getRecentOrders(limit: number = 10): Promise<SaleOrder[]> {
    return odoo.executeKw(
      'sale.order',
      'search_read',
      [
        [] // Array vacío = sin filtros (trae todos)
      ],
      {
        fields: ['id', 'name', 'partner_id', 'state', 'amount_total', 'date_order'],
        order: 'id desc', // Ordenar por los más recientes primero
        limit: limit,
      }
    );
  }

  /**
   * Busca una cotización por su nombre (ej: SO0001)
   */
  async getOrderByName(name: string): Promise<SaleOrder | null> {
    const orders = await odoo.executeKw(
      'sale.order',
      'search_read',
      [
        [['name', '=', name]]
      ],
      {
        fields: ['id', 'name', 'partner_id', 'state', 'amount_total', 'date_order'],
        limit: 1,
      }
    );
    
    return orders.length > 0 ? orders[0] : null;
  }

  /**
   * Crea una nueva orden de venta en Odoo, la confirma y genera órdenes de fabricación.
   * @param partnerId ID del cliente
   * @param lines Líneas del pedido
   * @param autoConfirm Si true, confirma y crea OFs automáticamente
   * @returns ID de la orden creada
   */
  async createQuote(
    partnerId: number,
    lines: SaleOrderLineInput[],
    rawItems: TermopanelItemData[] = [],
    autoConfirm = true
  ): Promise<number> {
    const orderLinesTuples = lines.map(line => {
      if (line.is_note) {
        // Línea de nota: solo texto, sin producto, sin cantidad, sin precio
        return [0, 0, {
          display_type: 'line_note',
          name: line.name,
        }];
      }
      return [0, 0, {
        product_id: line.product_id || false,
        name: line.name,
        product_uom_qty: line.product_uom_qty, // Cantidad calculada (m2 redondeado)
        product_uom_id: 1,                     // UOM = Units (id:1)
        price_unit: line.price_unit,           // Precio unitario por m2
        ...(line.x_studio_ancho_m !== undefined && { x_studio_ancho_m: line.x_studio_ancho_m }),
        ...(line.x_studio_alto_m !== undefined && { x_studio_alto_m: line.x_studio_alto_m }),
      }];
    });

    const orderData = {
      partner_id: partnerId,
      order_line: orderLinesTuples,
    };

    const newOrderId = await odoo.executeKw('sale.order', 'create', [[orderData]]);
    const orderId = Array.isArray(newOrderId) ? newOrderId[0] : newOrderId;

    // Forzar precio correcto ANTES de confirmar
    // (Odoo puede reemplazar price_unit con su lista de precios al crear)
    await this.forceLinePrices(orderId, lines);

    if (autoConfirm) {
      await this.confirmOrder(orderId);
      // Ejecutamos la creación de órdenes de fabricación en segundo plano (asíncronamente)
      // para evitar que la solicitud web exceda el tiempo de espera (timeout) de 15 segundos.
      this.createManufacturingOrders(orderId, lines, rawItems).catch(err => {
        console.error("Error creating manufacturing orders in background:", err);
      });
    }

    return orderId;
  }

  /**
   * Sobreescribe el price_unit de cada línea de la orden con el precio correcto de la app,
   * ignorando la lista de precios de Odoo.
   */
  async forceLinePrices(orderId: number, lines: SaleOrderLineInput[]): Promise<void> {
    const orderLines = await odoo.executeKw(
      'sale.order.line', 'search_read',
      [[['order_id', '=', orderId], ['display_type', '=', false]]],
      { fields: ['id'], order: 'id asc' }
    );

    const productLines = lines.filter(l => !l.is_note);

    const bulkUpdates = [];
    for (let i = 0; i < Math.min(orderLines.length, productLines.length); i++) {
      const lineId  = orderLines[i].id;
      const appLine = productLines[i];
      bulkUpdates.push([1, lineId, {
        price_unit: appLine.price_unit,
      }]);
    }

    if (bulkUpdates.length > 0) {
      await odoo.executeKw('sale.order', 'write', [
        [orderId],
        { order_line: bulkUpdates }
      ]);
    }
  }

  /**
   * Confirma una orden de venta (draft → sale).
   */
  async confirmOrder(orderId: number): Promise<void> {
    await odoo.executeKw('sale.order', 'action_confirm', [[orderId]]);
  }

  /**
   * Datos brutos de un item del cotizador, necesarios para crear OTs específicas por taller.
   */
  // (interface definida abajo)

  /**
   * Busca los IDs de los centros de trabajo (work centers) por nombre.
   * Cachea los resultados para evitar múltiples llamadas.
   */
  private workCenterCache: Record<string, number> = {};

  async getWorkCenterId(name: string): Promise<number | null> {
    if (this.workCenterCache[name]) return this.workCenterCache[name];

    const results = await odoo.executeKw(
      'mrp.workcenter',
      'search_read',
      [[['name', 'ilike', name]]],
      { fields: ['id', 'name'], limit: 1 }
    );

    if (results.length > 0) {
      this.workCenterCache[name] = results[0].id;
      return results[0].id;
    }
    return null;
  }

  /**
   * Crea órdenes de fabricación (mrp.production) para cada línea de producto de la orden.
   * Por cada línea:
   *   1. Crea una MO y la confirma
   *   2. Crea 2 work orders (mrp.workorder) vinculados a los work centers:
   *      - Taller Corte Vidrio  → medidas + tipo de cristal
   *      - Taller Termopaneles → medidas + cristales + separador (espesor + color)
   */
  async createManufacturingOrders(
    saleOrderId: number,
    lines: SaleOrderLineInput[],
    rawItems: TermopanelItemData[]
  ): Promise<number[]> {
    const productLines = lines.filter(l => !l.is_note && l.product_id && l.product_uom_qty > 0);

    // Buscar IDs de los centros de trabajo en paralelo
    const [wcCorteId, wcTermoId] = await Promise.all([
      this.getWorkCenterId('Taller Corte Vidrio'),
      this.getWorkCenterId('Taller Termopaneles'),
    ]);

    if (!wcCorteId || !wcTermoId) {
      console.error('No se encontraron los centros de trabajo en Odoo.', { wcCorteId, wcTermoId });
      throw new Error(
        `No se encontraron los centros de trabajo: ` +
        `${!wcCorteId ? '"Taller Corte Vidrio"' : ''} ` +
        `${!wcTermoId ? '"Taller Termopaneles"' : ''}`.trim()
      );
    }

    const moIds: number[] = [];
    for (let i = 0; i < productLines.length; i++) {
      const line = productLines[i];
      const item = rawItems[i];

      const fullDesc = [
        `Termopanel ${item.ancho} x ${item.alto} mm`,
        `C1: ${item.cristal1.tipo} ${item.cristal1.espesor}mm`,
        `C2: ${item.cristal2.tipo} ${item.cristal2.espesor}mm`,
        `Sep: ${item.separador.espesor}mm ${item.separador.color}`,
      ].join(' | ');

      // ─── Crear la Orden de Fabricación ─────────────────
      const moResult = await odoo.executeKw('mrp.production', 'create', [[{
        product_id: line.product_id,
        product_qty: line.product_uom_qty,
        origin: `S${saleOrderId}`,
        product_description_variants: fullDesc,
      }]]);
      const moId = Array.isArray(moResult) ? moResult[0] : moResult;
      moIds.push(moId);

      // ─── Crear Work Orders y Nota secuencialmente para evitar error 429 de Odoo ───
      // Work Order 1: TALLER CORTE VIDRIO
      try {
        await odoo.executeKw('mrp.workorder', 'create', [[{
          name: [
            `Corte Vidrio | ${item.ancho} x ${item.alto} mm`,
            `C1: ${item.cristal1.tipo} ${item.cristal1.espesor}mm`,
            `C2: ${item.cristal2.tipo} ${item.cristal2.espesor}mm`,
          ].join(' | '),
          production_id: moId,
          workcenter_id: wcCorteId,
          product_uom_id: 1,
          duration_expected: 60,
        }]]);
      } catch (e) {
        console.error(`Error WO Corte Vidrio MO ${moId}:`, e);
      }

      // Work Order 2: TALLER TERMOPANELES
      try {
        await odoo.executeKw('mrp.workorder', 'create', [[{
          name: [
            `Termopanel | ${item.ancho} x ${item.alto} mm`,
            `C1: ${item.cristal1.tipo} ${item.cristal1.espesor}mm`,
            `C2: ${item.cristal2.tipo} ${item.cristal2.espesor}mm`,
            `Sep: ${item.separador.espesor}mm ${item.separador.color}`,
          ].join(' | '),
          production_id: moId,
          workcenter_id: wcTermoId,
          product_uom_id: 1,
          duration_expected: 60,
        }]]);
      } catch (e) {
        console.error(`Error WO Termopaneles MO ${moId}:`, e);
      }

      // Nota general en la MO
      try {
        await odoo.executeKw('mrp.production', 'message_post', [[moId]], {
          body: [
            `<b>📋 Especificaciones del Termopanel</b>`,
            `<b>Cantidad:</b> ${item.cantidad}`,
            `<b>Medida:</b> ${item.ancho} x ${item.alto} mm`,
            `<b>Cristal 1:</b> ${item.cristal1.tipo} ${item.cristal1.espesor}mm`,
            `<b>Cristal 2:</b> ${item.cristal2.tipo} ${item.cristal2.espesor}mm`,
            `<b>Separador:</b> ${item.separador.espesor}mm - Color: ${item.separador.color}`,
          ].join('<br/>'),
          message_type: 'comment',
          subtype_xmlid: 'mail.mt_note',
        });
      } catch (e) {
        console.error(`Error nota MO ${moId}:`, e);
      }
    }

    return moIds;
  }
}

/**
 * Interface con los datos brutos de un item del cotizador de termopaneles.
 * Se usa para generar las órdenes de trabajo específicas por taller.
 */
export interface TermopanelItemData {
  cantidad: number;
  ancho: number;
  alto: number;
  cristal1: { tipo: string; espesor: number };
  cristal2: { tipo: string; espesor: number };
  separador: { espesor: number; color: string };
  gas: boolean;
  micropersiana: boolean;
  palillaje: boolean;
}

export const odooSales = new OdooSalesService();
