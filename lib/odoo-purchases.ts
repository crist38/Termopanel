import { odoo } from './odoo';

/**
 * Servicio para gestionar compras a proveedores en Odoo
 */
export class OdooPurchasesService {
  /**
   * Obtiene o crea un proveedor en Odoo (res.partner)
   */
  async getOrCreateVendor(name: string): Promise<number> {
    // 1. Buscar proveedor existente
    const results = await odoo.executeKw('res.partner', 'search_read', [
      [['name', 'ilike', name]],
      ['id', 'name']
    ]);

    // Odoo devuelve un array en search_read
    const vendors = Array.isArray(results) ? results : (results.records || []);

    const match = vendors.find((v: any) => v.name.toLowerCase() === name.toLowerCase());
    if (match) {
      return match.id;
    }

    // 2. Si no existe, crearlo
    const id = await odoo.executeKw('res.partner', 'create', [{
      name: name,
      is_company: true,
      supplier_rank: 1, // Lo marca como proveedor en algunas versiones de Odoo
    }]);

    return id;
  }

  /**
   * Obtiene o crea un producto en Odoo (product.product)
   */
  async getOrCreateProduct(name: string, defaultPrice: number = 0): Promise<number> {
    const results = await odoo.executeKw('product.product', 'search_read', [
      [['name', '=', name]],
      ['id', 'name']
    ]);

    const products = Array.isArray(results) ? results : (results.records || []);

    if (products.length > 0) {
      return products[0].id;
    }

    // Crear el producto genérico consumible
    const id = await odoo.executeKw('product.product', 'create', [{
      name: name,
      type: 'consu', // consumible para no requerir inventario estricto si no está configurado
      standard_price: defaultPrice,
      purchase_ok: true,
      sale_ok: false,
    }]);

    return id;
  }

  /**
   * Genera un Pedido de Compra (Purchase Order) a un proveedor
   */
  async createPurchaseOrder(vendorId: number, lines: { productId: number; name: string; qty: number }[], origin?: string, userId?: number): Promise<number> {
    if (lines.length === 0) return 0;

    const orderLines = lines.map(line => [0, 0, {
      product_id: line.productId,
      name: line.name,
      product_qty: line.qty,
      date_planned: new Date().toISOString().split('T')[0],
    }]);

    const orderData: any = {
      partner_id: vendorId,
      order_line: orderLines,
      origin: origin || 'Cotizador Automático',
    };
    
    if (userId) {
      orderData.user_id = userId;
    }

    try {
      return await odoo.executeKw('purchase.order', 'create', [orderData]);
    } catch (error: any) {
      if (userId) {
        console.warn(`Fallo al crear PO con user_id=${userId}. Reintentando sin user_id... Error original:`, error.message);
        delete orderData.user_id;
        return await odoo.executeKw('purchase.order', 'create', [orderData]);
      }
      throw error;
    }
  }

  /**
   * Elimina cualquier PO generada automáticamente por MTO al proveedor genérico
   */
  async cancelGenericMTOOrders(origin: string): Promise<void> {
    try {
      const vendors = await odoo.executeKw('res.partner', 'search_read', [
        [['name', 'ilike', 'Proveedor de Insumos (Genérico)']],
        ['id']
      ]);
      if (!vendors || vendors.length === 0) return;
      const genericVendorId = vendors[0].id;

      const pos = await odoo.executeKw('purchase.order', 'search', [
        [
          ['partner_id', '=', genericVendorId],
          ['origin', '=', origin],
          ['state', 'in', ['draft', 'sent']]
        ]
      ]);

      if (pos && pos.length > 0) {
        await odoo.executeKw('purchase.order', 'button_cancel', [pos]);
        await odoo.executeKw('purchase.order', 'unlink', [pos]);
      }
    } catch (e) {
      console.error('Error al limpiar compras genéricas MTO:', e);
    }
  }
}

export const odooPurchases = new OdooPurchasesService();
