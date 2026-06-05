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
    autoConfirm = true,
    clientName = ''
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
      // Ejecutamos la creación de órdenes de fabricación (ahora optimizada por lote)
      try {
        await this.createManufacturingOrders(orderId, lines, rawItems, clientName);
      } catch (err) {
        console.error("Error creating manufacturing orders:", err);
      }
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
  private productCache: Record<string, number> = {};
  private uomCache: Record<string, number> = {};

  /**
   * Busca la UOM (unidad de medida) por nombre, probando múltiples candidatos.
   * Cachea el resultado.
   */
  async getUomId(candidates: string[]): Promise<number | null> {
    for (const name of candidates) {
      const key = name.toLowerCase();
      if (this.uomCache[key]) return this.uomCache[key];
      const results = await odoo.executeKw(
        'uom.uom', 'search_read',
        [[['name', '=', name]]],
        { fields: ['id', 'name'], limit: 1 }
      );
      if (results.length > 0) {
        this.uomCache[key] = results[0].id;
        return results[0].id;
      }
    }
    // Si no encuentra exacto, intenta ilike con el primer candidato
    const fallback = await odoo.executeKw(
      'uom.uom', 'search_read',
      [[['name', 'ilike', candidates[0]]]],
      { fields: ['id', 'name'], limit: 1 }
    );
    if (fallback.length > 0) {
      this.uomCache[candidates[0].toLowerCase()] = fallback[0].id;
      return fallback[0].id;
    }
    return null;
  }

  /**
   * Busca un producto por nombre exacto. Si no existe, lo crea como consumible.
   * Cachea el product.product ID resultante.
   */
  async findOrCreateProduct(name: string, uomId: number): Promise<number | null> {
    const key = name.toLowerCase();
    if (this.productCache[key]) return this.productCache[key];

    // Buscar template existente
    const existing = await odoo.executeKw(
      'product.template', 'search_read',
      [[['name', '=', name]]],
      { fields: ['id', 'product_variant_ids'], limit: 1 }
    );

    if (existing.length > 0 && existing[0].product_variant_ids?.length > 0) {
      const productId = existing[0].product_variant_ids[0];
      this.productCache[key] = productId;
      return productId;
    }

    // Crear nuevo producto consumible
    const tmplResult = await odoo.executeKw('product.template', 'create', [[
      {
        name,
        type: 'consu',   // consumible: se registra en MO sin bloquear por stock
        uom_id: uomId,
        uom_po_id: uomId,
        purchase_ok: true,
        sale_ok: false,
      }
    ]]);
    const tmplId = Array.isArray(tmplResult) ? tmplResult[0] : tmplResult;

    // Obtener el product.product generado automáticamente
    const variants = await odoo.executeKw(
      'product.product', 'search_read',
      [[['product_tmpl_id', '=', tmplId]]],
      { fields: ['id'], limit: 1 }
    );
    if (variants.length > 0) {
      this.productCache[key] = variants[0].id;
      return variants[0].id;
    }
    return null;
  }

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
    rawItems: TermopanelItemData[],
    clientName = ''
  ): Promise<number[]> {
    const productLines = lines.filter(l => !l.is_note && l.product_id && l.product_uom_qty > 0);

    if (productLines.length === 0) return [];

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

    // 1. Buscar/crear productos de insumos y sus UOMs
    let hotmeltId: number | null = null;
    let salId: number | null = null;
    let builoId: number | null = null;
    let escuadrasId: number | null = null;
    const separadorProductMap: Record<string, number> = {};
    let uomMetrosId: number | null = null;
    let uomUnitsId: number | null = null;

    try {
      [uomMetrosId, uomUnitsId] = await Promise.all([
        this.getUomId(['m', 'Metro', 'Metros', 'Meter', 'Meters', 'metro(s)']),
        this.getUomId(['u', 'Units', 'Unit', 'Unidades', 'Unidad', 'uom_unit']),
      ]);

      if (uomMetrosId && uomUnitsId) {
        const sepKeys = [...new Set(rawItems.map(i => `Separador ${i.separador.espesor}mm ${i.separador.color}`))];

        const [hm, sal, but, esc, ...seps] = await Promise.all([
          this.findOrCreateProduct('Hotmelt', uomMetrosId),
          this.findOrCreateProduct('Sal Deshidratante', uomMetrosId),
          this.findOrCreateProduct('Butilo', uomMetrosId),
          this.findOrCreateProduct('Escuadras', uomUnitsId),
          ...sepKeys.map(k => this.findOrCreateProduct(k, uomMetrosId!)),
        ]);
        hotmeltId  = hm;
        salId      = sal;
        builoId    = but;
        escuadrasId = esc;
        sepKeys.forEach((k, i) => { if (seps[i]) separadorProductMap[k] = seps[i]!; });
      } else {
        console.warn('No se encontraron UOMs de metros o unidades en Odoo. Los insumos no se vincularán como componentes.');
      }
    } catch (e) {
      console.error('Error al buscar/crear productos de insumos:', e);
    }

    // 2. Preparar datos para creación por lote (batch) de Órdenes de Fabricación (MOs)
    const moDataList = productLines.map((line, i) => {
      const item = rawItems[i];
      const itemLabel = item.label || `V${i + 1}`;
      const fullDesc = [
        `[${itemLabel}]`,
        `Termopanel ${item.ancho} x ${item.alto} mm`,
        `C1: ${item.cristal1.tipo} ${item.cristal1.espesor}mm`,
        `C2: ${item.cristal2.tipo} ${item.cristal2.espesor}mm`,
        `Sep: ${item.separador.espesor}mm ${item.separador.color}`,
      ].join(' | ');

      // Calcular cantidades de insumos para este ítem
      const perimMl = 2 * (item.ancho + item.alto) / 1000;
      const totalMl = parseFloat((perimMl * item.cantidad).toFixed(3));
      const escuadrasQty = 4 * item.cantidad;
      const sepKey = `Separador ${item.separador.espesor}mm ${item.separador.color}`;

      // Construir componentes (move_raw_ids) si hay productos disponibles
      const moveRawIds: any[] = [];
      if (uomMetrosId) {
        if (hotmeltId)  moveRawIds.push([0, 0, { product_id: hotmeltId,  product_uom_qty: totalMl,       product_uom: uomMetrosId, name: 'Hotmelt' }]);
        if (salId)      moveRawIds.push([0, 0, { product_id: salId,      product_uom_qty: totalMl,       product_uom: uomMetrosId, name: 'Sal Deshidratante' }]);
        if (builoId)    moveRawIds.push([0, 0, { product_id: builoId,    product_uom_qty: totalMl,       product_uom: uomMetrosId, name: 'Butilo' }]);
        if (separadorProductMap[sepKey]) {
          moveRawIds.push([0, 0, { product_id: separadorProductMap[sepKey], product_uom_qty: totalMl, product_uom: uomMetrosId, name: sepKey }]);
        }
      }
      if (uomUnitsId && escuadrasId) {
        moveRawIds.push([0, 0, { product_id: escuadrasId, product_uom_qty: escuadrasQty, product_uom: uomUnitsId, name: 'Escuadras' }]);
      }

      return {
        product_id: line.product_id,
        product_qty: line.product_uom_qty,
        origin: `S${saleOrderId}`,
        product_description_variants: fullDesc,
        ...(moveRawIds.length > 0 && { move_raw_ids: moveRawIds }),
      };
    });

    // Crear todas las MOs en una sola llamada RPC
    const moResult = await odoo.executeKw('mrp.production', 'create', [moDataList]);
    const moIds: number[] = Array.isArray(moResult) ? moResult : [moResult];

    // 2. Preparar datos para creación por lote (batch) de Órdenes de Trabajo (WOs)
    const woDataList: any[] = [];
    for (let i = 0; i < moIds.length; i++) {
      const moId = moIds[i];
      const item = rawItems[i];
      const itemLabel = item.label || `V${i + 1}`;

      const clientPrefix = clientName ? `${clientName} | ` : '';

      // Work Order 1: TALLER CORTE VIDRIO
      woDataList.push({
        name: [
          `[${itemLabel}] ${clientPrefix}Corte Vidrio | ${item.ancho} x ${item.alto} mm`,
          `C1: ${item.cristal1.tipo} ${item.cristal1.espesor}mm`,
          `C2: ${item.cristal2.tipo} ${item.cristal2.espesor}mm`,
        ].join(' | '),
        production_id: moId,
        workcenter_id: wcCorteId,
        product_uom_id: 1,
        duration_expected: 60,
      });

      // Work Order 2: TALLER TERMOPANELES
      woDataList.push({
        name: [
          `[${itemLabel}] ${clientPrefix}Termopanel | ${item.ancho} x ${item.alto} mm`,
          `C1: ${item.cristal1.tipo} ${item.cristal1.espesor}mm`,
          `C2: ${item.cristal2.tipo} ${item.cristal2.espesor}mm`,
          `Sep: ${item.separador.espesor}mm ${item.separador.color}`,
        ].join(' | '),
        production_id: moId,
        workcenter_id: wcTermoId,
        product_uom_id: 1,
        duration_expected: 60,
      });
    }

    if (woDataList.length > 0) {
      try {
        await odoo.executeKw('mrp.workorder', 'create', [woDataList]);
      } catch (e) {
        console.error('Error al crear Órdenes de Trabajo (WOs) por lote:', e);
      }
    }

    // 3. Helper para calcular insumos de cada ítem
    const calcInsumos = (item: TermopanelItemData, idx: number) => {
      const perimMl = 2 * (item.ancho + item.alto) / 1000; // metros lineales de perímetro
      const totalMl = perimMl * item.cantidad;
      return {
        label: item.label || `V${idx + 1}`,
        perimMl,
        totalMl,
        escuadras: 4 * item.cantidad,
      };
    };

    // 4. Publicar notas en el chatter de cada MO en paralelo (specs + insumos del ítem)
    const notePromises = moIds.map((moId, i) => {
      const item = rawItems[i];
      const itemLabel = item.label || `V${i + 1}`;
      const ins = calcInsumos(item, i);
      const body = [
        `<b>📋 Especificaciones del Termopanel [${itemLabel}]</b>`,
        `<b>Cantidad:</b> ${item.cantidad}`,
        `<b>Medida:</b> ${item.ancho} x ${item.alto} mm`,
        `<b>Cristal 1:</b> ${item.cristal1.tipo} ${item.cristal1.espesor}mm`,
        `<b>Cristal 2:</b> ${item.cristal2.tipo} ${item.cristal2.espesor}mm`,
        `<b>Separador:</b> ${item.separador.espesor}mm - Color: ${item.separador.color}`,
        `&nbsp;`,
        `<b>📦 Insumos [${itemLabel}] — ${item.cantidad} ud × ${ins.perimMl.toFixed(3)} ml/ud</b>`,
        `<b>Separador ${item.separador.espesor}mm ${item.separador.color}:</b> ${ins.totalMl.toFixed(3)} ml`,
        `<b>Hotmelt:</b> ${ins.totalMl.toFixed(3)} ml`,
        `<b>Sal deshidratante:</b> ${ins.totalMl.toFixed(3)} ml`,
        `<b>Butilo:</b> ${ins.totalMl.toFixed(3)} ml`,
        `<b>Escuadras:</b> ${ins.escuadras} unidades`,
      ].join('<br/>');

      return odoo.executeKw('mrp.production', 'message_post', [[moId]], {
        body: body,
        message_type: 'comment',
        subtype_xmlid: 'mail.mt_note',
      }).catch(e => {
        console.error(`Error al publicar nota en MO ${moId}:`, e);
      });
    });

    await Promise.allSettled(notePromises);

    // 5. Publicar resumen total de insumos en la Orden de Venta
    try {
      const allInsumos = rawItems.map((item, i) => calcInsumos(item, i));
      const totSeparador  = allInsumos.reduce((s, x) => s + x.totalMl, 0);
      const totHotmelt    = allInsumos.reduce((s, x) => s + x.totalMl, 0);
      const totSal        = allInsumos.reduce((s, x) => s + x.totalMl, 0);
      const totButilo     = allInsumos.reduce((s, x) => s + x.totalMl, 0);
      const totEscuadras  = allInsumos.reduce((s, x) => s + x.escuadras, 0);

      const itemRows = allInsumos.map(ins =>
        `&nbsp;&nbsp;• <b>[${ins.label}]:</b> ${ins.perimMl.toFixed(3)} ml/ud × ${ins.escuadras / 4} ud = ${ins.totalMl.toFixed(3)} ml | Escuadras: ${ins.escuadras}`
      ).join('<br/>');

      const summaryBody = [
        `<b>📊 RESUMEN TOTAL DE INSUMOS — ${clientName || 'Cliente'}</b>`,
        `<b>─────────────────────────────</b>`,
        itemRows,
        `<b>─────────────────────────────</b>`,
        `<b>Separador (total):</b> ${totSeparador.toFixed(3)} ml`,
        `<b>Hotmelt (total):</b> ${totHotmelt.toFixed(3)} ml`,
        `<b>Sal deshidratante (total):</b> ${totSal.toFixed(3)} ml`,
        `<b>Butilo (total):</b> ${totButilo.toFixed(3)} ml`,
        `<b>Escuadras (total):</b> ${totEscuadras} unidades`,
      ].join('<br/>');

      await odoo.executeKw('sale.order', 'message_post', [[saleOrderId]], {
        body: summaryBody,
        message_type: 'comment',
        subtype_xmlid: 'mail.mt_note',
      });
    } catch (e) {
      console.error('Error al publicar resumen de insumos en la SO:', e);
    }

    return moIds;
  }
}

/**
 * Interface con los datos brutos de un item del cotizador de termopaneles.
 * Se usa para generar las órdenes de trabajo específicas por taller.
 */
export interface TermopanelItemData {
  label?: string;
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
