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
  product_uom_qty: number; // Cantidad en piezas
  price_unit: number;      // Precio por pieza
  is_note?: boolean;
  // Campos personalizados del Studio de Odoo para dimensiones
  x_studio_ancho_m?: number; // Ancho en metros
  x_studio_alto_m?: number;  // Alto en metros
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
        product_uom_qty: line.product_uom_qty, // Número de piezas
        product_uom_id: 1,                     // UOM = Units (id:1), evita que x_studio controle la qty
        price_unit: line.price_unit,
        // Dimensiones informativas (x_studio puede recomponer qty pero lo sobreescribimos en write)
        ...(line.x_studio_ancho_m !== undefined && { x_studio_ancho_m: line.x_studio_ancho_m }),
        ...(line.x_studio_alto_m  !== undefined && { x_studio_alto_m:  line.x_studio_alto_m  }),
      }];
    });

    const orderData = {
      partner_id: partnerId,
      order_line: orderLinesTuples,
    };

    const newOrderId = await odoo.executeKw('sale.order', 'create', [[orderData]]);
    const orderId = Array.isArray(newOrderId) ? newOrderId[0] : newOrderId;

    // Forzar el precio correcto en cada línea ANTES de confirmar
    // Odoo reemplaza price_unit con su lista de precios al crear, por eso usamos write() por separado
    await this.forceLinePrices(orderId, lines);

    if (autoConfirm) {
      await this.confirmOrder(orderId);
      await this.createManufacturingOrders(orderId, lines);
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

    for (let i = 0; i < Math.min(orderLines.length, productLines.length); i++) {
      const lineId  = orderLines[i].id;
      const appLine = productLines[i];
      // Forzar precio y cantidad correctos antes de confirmar.
      // Odoo reemplaza price_unit con su lista de precios al crear.
      // Si x_studio recomputó product_uom_qty, este write lo restaura.
      await odoo.executeKw('sale.order.line', 'write', [
        [lineId],
        {
          price_unit: appLine.price_unit,
          product_uom_qty: appLine.product_uom_qty,
          product_uom_id: 1, // Units - mantener unidad para evitar recalculo
        }
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
   * Crea órdenes de fabricación (mrp.production) para cada línea de producto de la orden.
   * Se usa cuando el producto no tiene BOM configurada en Odoo.
   */
  async createManufacturingOrders(
    saleOrderId: number,
    lines: SaleOrderLineInput[]
  ): Promise<number[]> {
    const productLines = lines.filter(l => !l.is_note && l.product_id && l.product_uom_qty > 0);
    const moIds: number[] = [];

    for (const line of productLines) {
      // Construir descripción detallada visible en la orden de fabricación
      const moData = {
        product_id: line.product_id,
        product_qty: line.product_uom_qty,
        origin: `S${saleOrderId}`,
        // product_description_variants aparece como "Custom Description" en la OF
        product_description_variants: line.name,
      };

      const moId = await odoo.executeKw('mrp.production', 'create', [[moData]]);
      const id = Array.isArray(moId) ? moId[0] : moId;
      moIds.push(id);

      // Publicar nota en el chatter de la OF con todos los detalles del termopanel
      await odoo.executeKw('mrp.production', 'message_post', [[id]], {
        body: `<b>Especificaciones del Termopanel:</b><br/>${line.name.replace(/\|/g, '<br/>')}`,
        message_type: 'comment',
        subtype_xmlid: 'mail.mt_note',
      });
    }

    return moIds;
  }
}

export const odooSales = new OdooSalesService();
