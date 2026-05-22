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
  name: string; // Descripción de la línea
  product_uom_qty: number;
  price_unit: number;
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
   * Crea una nueva cotización (Sale Order) en Odoo.
   * @param partnerId ID del cliente (res.partner) al que se le asocia la cotización
   * @param lines Arreglo con las líneas de detalle de la cotización
   * @returns El ID de la cotización creada
   */
  async createQuote(partnerId: number, lines: SaleOrderLineInput[]): Promise<number> {
    // En Odoo, para crear registros relacionados (One2many), se usa la tupla especial [0, 0, { valores }]
    const orderLinesTuples = lines.map(line => [
      0, 
      0, 
      {
        product_id: line.product_id || false, // Opcional, pero recomendado
        name: line.name, // Descripción obligatoria
        product_uom_qty: line.product_uom_qty,
        price_unit: line.price_unit,
      }
    ]);

    const orderData = {
      partner_id: partnerId,
      order_line: orderLinesTuples,
      state: 'draft', // Se crea en estado de cotización (borrador)
    };

    // Al llamar 'create', Odoo espera un array donde el primer elemento es un objeto con los datos
    const newOrderId = await odoo.executeKw(
      'sale.order',
      'create',
      [[orderData]]
    );

    return Array.isArray(newOrderId) ? newOrderId[0] : newOrderId;
  }
}

export const odooSales = new OdooSalesService();
