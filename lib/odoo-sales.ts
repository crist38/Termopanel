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
  amount_untaxed: number;
  amount_tax: number;
  date_order: string;
  user_id: [number, string] | false;
  note: string | false;
}

/**
 * Interface para una línea de pedido con detalle completo
 */
export interface OrderLine {
  id: number;
  name: string;
  product_uom_qty: number;
  price_unit: number;
  price_subtotal: number;
  discount?: number;
  display_type: string | false;
  product_id: [number, string] | false;
  x_studio_ancho_m?: number;
  x_studio_alto_m?: number;
}

/**
 * Interface para el detalle completo de una orden
 */
export interface OrderDetail extends SaleOrder {
  order_line: OrderLine[];
}

/**
 * Parámetros de búsqueda para listar órdenes
 */
export interface OrderSearchParams {
  search?: string;         // Buscar por nombre SO o cliente
  state?: string;          // 'draft' | 'sale' | 'cancel' | '' (todos)
  limit?: number;
  offset?: number;
  orderBy?: string;
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

function getGlassOdooName(tipo: string, espesor: number): string {
  const t = tipo.toLowerCase();
  
  if (t.includes('incoloro') || t.includes('float')) {
    if (espesor === 5) return 'Cristal Dim. Incoloro 5mm 119x125';
    if (espesor === 10) return 'Cristal Dim. Incoloro 10mm diferentes medidas';
    return `Cristal Dim. Incoloro ${espesor}mm`;
  }
  
  if (t.includes('bronce')) {
    return `Cristal Dim. bronce ${espesor}mm`;
  }
  
  if (t.includes('laminado')) {
    return `Cristal Dim. Laminado ${espesor}mm`;
  }
  
  if (t.includes('saten') || t.includes('satinado')) {
    return 'Cristal Dim. Saten difrentes medidas';
  }
  
  if (t.includes('solar cool') || t.includes('solcool')) {
    return `Cristal Dim. Solar Cool ${espesor}mm`;
  }
  
  if (t.includes('bluegreen') || t.includes('azulite')) {
    return `Cristal Dim. azulite ${espesor}mm`;
  }

  if (t.includes('semilla bronce')) {
    return 'Catedral Dim. Semilla Bronce';
  }

  if (t.includes('semilla')) {
    return 'Catedral Dim. Semilla Incoloro';
  }

  if (t.includes('espejo')) {
    return `Espejo Dim. incoloro ${espesor}mm`;
  }

  if (t.includes('empavonado')) {
    return `Catedral Dim. Difuso 2mm`;
  }
  
  return `Cristal Dim. ${tipo} ${espesor}mm`;
}

function getEscuadraName(espesor: number): string {
  const escuadraVal = espesor - 0.5;
  return `Escuadra porta sal ${escuadraVal}`;
}

export class OdooSalesService {
  private termopanelTagId: number | null = null;

  /**
   * Obtiene o crea la etiqueta configurada (ej: "Termopanel") en Odoo.
   * Retorna el ID de la etiqueta, o null si hay algún error.
   */
  async getOrCreateTermopanelTagId(): Promise<number | null> {
    if (this.termopanelTagId !== null) {
      return this.termopanelTagId;
    }
    try {
      const tagName = process.env.ODOO_TAG_NAME || 'Termopanel';
      // 1. Buscar si ya existe una etiqueta con el nombre
      const tags = await odoo.executeKw(
        'crm.tag',
        'search_read',
        [[['name', '=', tagName]]],
        { fields: ['id'], limit: 1 }
      );

      if (tags && tags.length > 0) {
        this.termopanelTagId = tags[0].id;
        return this.termopanelTagId;
      }

      // 2. Si no existe, crearla
      const newTagId = await odoo.executeKw(
        'crm.tag',
        'create',
        [[{ name: tagName }]]
      );
      
      const tagId = Array.isArray(newTagId) ? newTagId[0] : newTagId;
      this.termopanelTagId = tagId;
      return tagId;
    } catch (error) {
      console.error(`Error al obtener o crear la etiqueta "${process.env.ODOO_TAG_NAME || 'Termopanel'}" en Odoo:`, error);
      return null;
    }
  }

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
    clientName = '',
    userId?: number,
    note?: string
  ): Promise<{ id: number; name: string }> {
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

    const tagId = await this.getOrCreateTermopanelTagId();
    const orderData: any = {
      partner_id: partnerId,
      order_line: orderLinesTuples,
    };
    if (userId) orderData.user_id = userId;
    if (tagId) {
      orderData.tag_ids = [[6, 0, [tagId]]];
    }
    if (note) {
      orderData.note = note;
    }

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

    const orderDataResp = await odoo.executeKw('sale.order', 'search_read', [[['id', '=', orderId]]], { fields: ['name'], limit: 1 });
    const orderName = orderDataResp.length > 0 ? orderDataResp[0].name : `SO${orderId}`;

    return { id: orderId, name: orderName };
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

  async findSeparatorProduct(espesor: number, color: string, uomId: number): Promise<number | null> {
    let templateName = `Separador Perfil porta sal ${espesor} mm`;
    if (espesor === 10) {
      templateName = 'Separador porta sal silica 10 mm';
    } else if (espesor === 6) {
      templateName = 'Separador Porta sal silica 6mm';
    }

    const cacheKey = `separador_${espesor}_${color}`.toLowerCase();
    if (this.productCache[cacheKey]) return this.productCache[cacheKey];

    // Buscar si existe el producto por nombre exacto en Odoo
    const templates = await odoo.executeKw(
      'product.template', 'search_read',
      [[['name', '=', templateName]]],
      { fields: ['id', 'default_code', 'product_variant_ids'] }
    );

    if (templates && templates.length > 0) {
      let selectedTemplate = templates[0];
      
      if (templates.length > 1) {
        // Encontrar por sufijo de código según el color (Br = bronce, Ma = mate/aluminio)
        const isBronce = color.toLowerCase().includes('bronce');
        const targetSuffix = isBronce ? 'br' : 'ma';
        
        const matching = templates.find((t: any) => 
          t.default_code && t.default_code.toLowerCase().endsWith(targetSuffix)
        );
        if (matching) {
          selectedTemplate = matching;
        }
      }

      if (selectedTemplate.product_variant_ids && selectedTemplate.product_variant_ids.length > 0) {
        const productId = selectedTemplate.product_variant_ids[0];
        this.productCache[cacheKey] = productId;
        return productId;
      }
    }

    // Si no existe, crearlo dinámicamente
    return this.findOrCreateProduct(templateName, uomId);
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
    const separadorProductMap: Record<string, number> = {};
    const glassProductMap: Record<string, number> = {};
    const escuadraProductMap: Record<string, number> = {};
    let uomMetrosId: number | null = null;
    let uomUnitsId: number | null = null;
    let uomM2Id: number | null = null;
    let pulidoId: number | null = null;

    try {
      // Buscar UOMs de forma secuencial para no disparar 429
      uomMetrosId = await this.getUomId(['m', 'Metro', 'Metros', 'Meter', 'Meters', 'metro(s)']);
      await new Promise(r => setTimeout(r, 300));
      uomUnitsId  = await this.getUomId(['u', 'Units', 'Unit', 'Unidades', 'Unidad', 'uom_unit']);
      await new Promise(r => setTimeout(r, 300));
      uomM2Id     = await this.getUomId(['m²', 'm2', 'Square Meters', 'Square Meter', 'Metros Cuadrados', 'Metro Cuadrado', 'm2(s)']);

      // Buscar/crear productos de insumos y componentes de forma secuencial
      const glassKeys = rawItems
        .flatMap(i => [
          getGlassOdooName(i.cristal1.tipo, i.cristal1.espesor),
          getGlassOdooName(i.cristal2.tipo, i.cristal2.espesor)
        ])
        .filter((val, idx, self) => self.indexOf(val) === idx);

      const escuadraKeys = rawItems
        .map(i => getEscuadraName(i.separador.espesor))
        .filter((val, idx, self) => self.indexOf(val) === idx);

      const hasPulido = rawItems.some(i => i.pulido);

      if (uomMetrosId) {
        hotmeltId = await this.findOrCreateProduct('Hotmelt para DVH ', uomMetrosId);
        await new Promise(r => setTimeout(r, 300));
        salId     = await this.findOrCreateProduct('Sal silica Gel 1 kg.', uomMetrosId);
        await new Promise(r => setTimeout(r, 300));
        builoId   = await this.findOrCreateProduct('Butilo para DVH', uomMetrosId);
        await new Promise(r => setTimeout(r, 300));

        // Separadores correspondientes a cada ítem según espesor y color
        for (const item of rawItems) {
          const sepKey = `${item.separador.espesor}_${item.separador.color}`.toLowerCase();
          if (!separadorProductMap[sepKey]) {
            const sepId = await this.findSeparatorProduct(item.separador.espesor, item.separador.color, uomMetrosId);
            if (sepId) separadorProductMap[sepKey] = sepId;
            await new Promise(r => setTimeout(r, 300));
          }
        }

        if (hasPulido) {
          pulidoId = await this.findOrCreateProduct('Pulido', uomMetrosId);
          await new Promise(r => setTimeout(r, 300));
        }
      }

      if (uomUnitsId) {
        for (const k of escuadraKeys) {
          const escId = await this.findOrCreateProduct(k, uomUnitsId);
          if (escId) escuadraProductMap[k] = escId;
          await new Promise(r => setTimeout(r, 300));
        }
      }

      const glassUomId = uomM2Id || uomUnitsId || 1;
      for (const k of glassKeys) {
        const glassId = await this.findOrCreateProduct(k, glassUomId);
        if (glassId) glassProductMap[k] = glassId;
        await new Promise(r => setTimeout(r, 300));
      }

    } catch (e) {
      console.error('Error al buscar/crear productos de insumos/componentes:', e);
    }

    // 2. Preparar datos para creación por lote (batch) de Órdenes de Fabricación (MOs)
    const moDataList = productLines.map((line, i) => {
      const item = rawItems[i];
      const itemLabel = item.label || `V${i + 1}`;
      const c1NameMapped = getGlassOdooName(item.cristal1.tipo, item.cristal1.espesor);
      const c2NameMapped = getGlassOdooName(item.cristal2.tipo, item.cristal2.espesor);
      
      const fullDescParts = [
        `[${itemLabel}]`,
        `Termopanel ${item.ancho} x ${item.alto} mm`,
        `C1: ${c1NameMapped}`,
        `C2: ${c2NameMapped}`,
        `Sep: ${item.separador.espesor}mm ${item.separador.color}`,
      ];
      if (item.pulido) fullDescParts.push('Pulido');
      if (item.micropersiana) fullDescParts.push('Micropersiana');
      if (item.palillaje) {
        fullDescParts.push(`Palillaje: SI (Color: ${item.palillajeColor || 'Blanco'}, H: ${item.palillajeHorizontales || 0}, V: ${item.palillajeVerticales || 0})`);
      }
      if (item.conForma) fullDescParts.push('Con Forma: SI');
      const fullDesc = fullDescParts.join(' | ');

      return {
        product_id: line.product_id,
        product_qty: line.product_uom_qty,
        origin: `S${saleOrderId}`,
        product_description_variants: fullDesc,
        bom_id: false,
      };
    });

    // Crear todas las MOs en una sola llamada RPC (sin insumos todavía para que Odoo asigne las ubicaciones)
    const moResult = await odoo.executeKw('mrp.production', 'create', [moDataList]);
    const moIds: number[] = Array.isArray(moResult) ? moResult : [moResult];

    // Obtener las ubicaciones de producción que Odoo asignó automáticamente
    const mosData = await odoo.executeKw(
      'mrp.production', 'read', [moIds],
      { fields: ['id', 'location_src_id', 'production_location_id'] }
    );

    // Escribir los insumos (componentes) en cada MO usando las ubicaciones correctas
    for (let i = 0; i < moIds.length; i++) {
      const moId = moIds[i];
      const item = rawItems[i];
      const moRecord = mosData.find((m: any) => m.id === moId);
      
      let locSrcId: number | null = null;
      let locDestId: number | null = null;

      if (!moRecord || !moRecord.location_src_id || !moRecord.production_location_id) {
        console.error(`Faltan ubicaciones en MO ${moId}. Record:`, moRecord);
        await odoo.executeKw('mrp.production', 'message_post', [[moId]], {
          body: `<b>⚠️ Error del Cotizador:</b> No se pudieron inyectar los componentes reales porque faltan las ubicaciones de producción (location_src_id o production_location_id) en esta Orden. Record: ${JSON.stringify(moRecord)}`,
          message_type: 'comment',
        });
        // Intentaremos continuar sin ubicaciones para ver si Odoo las auto-asigna
      } else {
        locSrcId = moRecord.location_src_id[0];
        locDestId = moRecord.production_location_id[0];
      }

      // Calcular cantidades de insumos para este ítem
      const perimMl = 2 * (item.ancho + item.alto) / 1000;
      const totalMl = parseFloat((perimMl * item.cantidad).toFixed(3));
      
      const escuadraKey = getEscuadraName(item.separador.espesor);
      const escuadrasId = escuadraProductMap[escuadraKey];
      const escuadrasQty = 4 * item.cantidad;
      
      const sepKey = `${item.separador.espesor}_${item.separador.color}`.toLowerCase();
      const sepProductId = separadorProductMap[sepKey];

      // Calcular cantidad de cristales (m2)
      const glassArea = (item.ancho / 1000) * (item.alto / 1000) * item.cantidad;
      const glassAreaQty = parseFloat(glassArea.toFixed(3));

      const c1Key = getGlassOdooName(item.cristal1.tipo, item.cristal1.espesor);
      const c2Key = getGlassOdooName(item.cristal2.tipo, item.cristal2.espesor);

      const moveRawIds: any[] = [[5, 0, 0]]; // [5, 0, 0] elimina los componentes genéricos del BOM

      const glassUomId = uomM2Id || uomUnitsId || 1;
      if (glassProductMap[c1Key]) {
        const moveData: any = { product_id: glassProductMap[c1Key], product_uom_qty: glassAreaQty, product_uom: glassUomId };
        if (locSrcId) moveData.location_id = locSrcId;
        if (locDestId) moveData.location_dest_id = locDestId;
        moveRawIds.push([0, 0, moveData]);
      }
      if (glassProductMap[c2Key]) {
        const moveData: any = { product_id: glassProductMap[c2Key], product_uom_qty: glassAreaQty, product_uom: glassUomId };
        if (locSrcId) moveData.location_id = locSrcId;
        if (locDestId) moveData.location_dest_id = locDestId;
        moveRawIds.push([0, 0, moveData]);
      }

      if (uomMetrosId) {
        const addMove = (prodId: number, qty: number, uom: number) => {
          const moveData: any = { product_id: prodId, product_uom_qty: qty, product_uom: uom };
          if (locSrcId) moveData.location_id = locSrcId;
          if (locDestId) moveData.location_dest_id = locDestId;
          moveRawIds.push([0, 0, moveData]);
        };
        if (hotmeltId) addMove(hotmeltId, totalMl, uomMetrosId);
        if (salId) addMove(salId, totalMl, uomMetrosId);
        if (builoId) addMove(builoId, totalMl, uomMetrosId);
        if (sepProductId) {
          addMove(sepProductId, totalMl, uomMetrosId);
        }
        if (item.pulido && pulidoId) addMove(pulidoId, totalMl, uomMetrosId);
      } else if (item.pulido && pulidoId && uomUnitsId) {
        const moveData: any = { product_id: pulidoId, product_uom_qty: item.cantidad, product_uom: uomUnitsId };
        if (locSrcId) moveData.location_id = locSrcId;
        if (locDestId) moveData.location_dest_id = locDestId;
        moveRawIds.push([0, 0, moveData]);
      }

      if (uomUnitsId && escuadrasId) {
        const moveData: any = { product_id: escuadrasId, product_uom_qty: escuadrasQty, product_uom: uomUnitsId };
        if (locSrcId) moveData.location_id = locSrcId;
        if (locDestId) moveData.location_dest_id = locDestId;
        moveRawIds.push([0, 0, moveData]);
      }

      if (moveRawIds.length > 1) { // > 1 porque el primero es [5, 0, 0]
        try {
          await odoo.executeKw('mrp.production', 'write', [[moId], { move_raw_ids: moveRawIds }]);
        } catch (err: any) {
          console.error(`Error al vincular componentes en MO ${moId}:`, err);
          await odoo.executeKw('mrp.production', 'message_post', [[moId]], {
            body: `<b>⚠️ Error del Cotizador:</b> Excepción al inyectar componentes: ${err.message || JSON.stringify(err)}`,
            message_type: 'comment',
          });
        }
      } else {
        await odoo.executeKw('mrp.production', 'message_post', [[moId]], {
          body: `<b>⚠️ Error del Cotizador:</b> No se generaron componentes para inyectar (moveRawIds vacío o productos no encontrados).`,
          message_type: 'comment',
        });
      }
    }

    // 2. Preparar datos para creación por lote (batch) de Órdenes de Trabajo (WOs)
    const woDataList: any[] = [];
    for (let i = 0; i < moIds.length; i++) {
      const moId = moIds[i];
      const item = rawItems[i];
      
      // Confirmar la MO antes de crear las órdenes de trabajo
      await odoo.executeKw('mrp.production', 'action_confirm', [[moId]]);

      const itemLabel = item.label || `V${i + 1}`;

      const clientPrefix = clientName ? `${clientName} | ` : '';
      const c1NameMapped = getGlassOdooName(item.cristal1.tipo, item.cristal1.espesor);
      const c2NameMapped = getGlassOdooName(item.cristal2.tipo, item.cristal2.espesor);

      // Work Order 1: TALLER CORTE VIDRIO
      const corteWoParts = [
        `[${itemLabel}] ${clientPrefix}Corte Vidrio | ${item.ancho} x ${item.alto} mm`,
        `C1: ${c1NameMapped}`,
        `C2: ${c2NameMapped}`,
      ];
      if (item.conForma) {
        corteWoParts.push('Con Forma (Plantilla)');
      }
      woDataList.push({
        name: corteWoParts.join(' | '),
        production_id: moId,
        workcenter_id: wcCorteId,
        product_uom_id: 1,
        duration_expected: 60,
      });

      // Work Order 2: TALLER TERMOPANELES
      const termoWoParts = [
        `[${itemLabel}] ${clientPrefix}Termopanel | ${item.ancho} x ${item.alto} mm`,
        `C1: ${c1NameMapped}`,
        `C2: ${c2NameMapped}`,
        `Sep: ${item.separador.espesor}mm ${item.separador.color}`,
      ];
      if (item.palillaje) {
        termoWoParts.push(`Palillaje: ${item.palillajeColor || 'Blanco'} H:${item.palillajeHorizontales || 0} V:${item.palillajeVerticales || 0}`);
      }
      if (item.conForma) {
        termoWoParts.push('Con Forma (Plantilla)');
      }
      woDataList.push({
        name: termoWoParts.join(' | '),
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

    // 4. Publicar notas en el chatter de cada MO de forma secuencial (evita 429)
    const calcInsumos = (item: TermopanelItemData, idx: number) => {
      const perimMl = 2 * (item.ancho + item.alto) / 1000;
      const totalMl = perimMl * item.cantidad;
      const glassArea = (item.ancho / 1000) * (item.alto / 1000) * item.cantidad;
      return {
        label: item.label || `V${idx + 1}`,
        perimMl,
        totalMl,
        glassArea,
        escuadras: 4 * item.cantidad,
      };
    };

    for (let i = 0; i < moIds.length; i++) {
      const moId = moIds[i];
      const item = rawItems[i];
      const itemLabel = item.label || `V${i + 1}`;
      const ins = calcInsumos(item, i);
      const glassAreaPerUnit = (item.ancho / 1000) * (item.alto / 1000);
      const c1NameMapped = getGlassOdooName(item.cristal1.tipo, item.cristal1.espesor);
      const c2NameMapped = getGlassOdooName(item.cristal2.tipo, item.cristal2.espesor);
      const escuadraKey = getEscuadraName(item.separador.espesor);

      const bodyParts = [
        `<b>📋 Especificaciones del Termopanel [${itemLabel}]</b>`,
        `<b>Cantidad:</b> ${item.cantidad}`,
        `<b>Medida:</b> ${item.ancho} x ${item.alto} mm`,
        `<b>Cristal 1:</b> ${c1NameMapped}`,
        `<b>Cristal 2:</b> ${c2NameMapped}`,
        `<b>Separador:</b> ${item.separador.espesor}mm - Color: ${item.separador.color}`,
      ];
      if (item.pulido) bodyParts.push(`<b>Pulido:</b> SI`);
      if (item.micropersiana) bodyParts.push(`<b>Micropersiana:</b> SI`);
      if (item.palillaje) {
        bodyParts.push(`<b>Palillaje:</b> SI (Color: ${item.palillajeColor || 'Blanco'}, H: ${item.palillajeHorizontales || 0}, V: ${item.palillajeVerticales || 0})`);
      }
      if (item.conForma) bodyParts.push(`<b>Con Forma Especial:</b> SI`);
      
      const insumosSection = [
        `&nbsp;`,
        `<b>📦 Insumos [${itemLabel}]</b>`,
        `<b>Cristal 1 (${c1NameMapped}):</b> ${ins.glassArea.toFixed(3)} m² (${item.cantidad} ud × ${glassAreaPerUnit.toFixed(3)} m²/ud)`,
        `<b>Cristal 2 (${c2NameMapped}):</b> ${ins.glassArea.toFixed(3)} m² (${item.cantidad} ud × ${glassAreaPerUnit.toFixed(3)} m²/ud)`,
        `<b>Separador ${item.separador.espesor}mm ${item.separador.color}:</b> ${ins.totalMl.toFixed(3)} ml (${item.cantidad} ud × ${ins.perimMl.toFixed(3)} ml/ud)`,
        `<b>Hotmelt:</b> ${ins.totalMl.toFixed(3)} ml`,
        `<b>Sal deshidratante:</b> ${ins.totalMl.toFixed(3)} ml`,
        `<b>Butilo:</b> ${ins.totalMl.toFixed(3)} ml`,
        `<b>${escuadraKey}:</b> ${ins.escuadras} unidades`
      ];
      if (item.pulido) {
        insumosSection.push(`<b>Pulido:</b> ${ins.totalMl.toFixed(3)} ml`);
      }
      bodyParts.push(...insumosSection);
      
      const body = bodyParts.join('<br/>');

      try {
        await odoo.executeKw('mrp.production', 'message_post', [[moId]], {
          body,
          message_type: 'comment',
          subtype_xmlid: 'mail.mt_note',
        });
      } catch (e) {
        console.error(`Error al publicar nota en MO ${moId}:`, e);
      }
      // Pausa entre notas para no saturar Odoo
      if (i < moIds.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    // 5. Publicar resumen total de insumos en la Orden de Venta
    try {
      const allInsumos = rawItems.map((item, i) => calcInsumos(item, i));
      const totHotmelt    = allInsumos.reduce((s, x) => s + x.totalMl, 0);
      const totSal        = allInsumos.reduce((s, x) => s + x.totalMl, 0);
      const totButilo     = allInsumos.reduce((s, x) => s + x.totalMl, 0);

      // Agrupar cristales totales por tipo y espesor mapeados
      const glassTotals: Record<string, number> = {};
      rawItems.forEach(item => {
        const c1Key = getGlassOdooName(item.cristal1.tipo, item.cristal1.espesor);
        const c2Key = getGlassOdooName(item.cristal2.tipo, item.cristal2.espesor);
        const area = (item.ancho / 1000) * (item.alto / 1000) * item.cantidad;
        glassTotals[c1Key] = (glassTotals[c1Key] || 0) + area;
        glassTotals[c2Key] = (glassTotals[c2Key] || 0) + area;
      });

      const glassRows = Object.entries(glassTotals).map(([key, val]) =>
        `<b>${key} (total):</b> ${val.toFixed(3)} m²`
      );

      // Agrupar separadores por tipo/color
      const sepTotals: Record<string, number> = {};
      rawItems.forEach(item => {
        const key = item.separador.espesor === 10 ? 'Separador porta sal silica 10 mm' : (item.separador.espesor === 6 ? 'Separador Porta sal silica 6mm' : `Separador Perfil porta sal ${item.separador.espesor} mm`);
        const perimeter = 2 * (item.ancho + item.alto) / 1000 * item.cantidad;
        sepTotals[key] = (sepTotals[key] || 0) + perimeter;
      });
      const sepRows = Object.entries(sepTotals).map(([key, val]) =>
        `<b>${key} (total):</b> ${val.toFixed(3)} ml`
      );

      // Agrupar escuadras
      const escTotals: Record<string, number> = {};
      rawItems.forEach(item => {
        const key = getEscuadraName(item.separador.espesor);
        escTotals[key] = (escTotals[key] || 0) + (4 * item.cantidad);
      });
      const escRows = Object.entries(escTotals).map(([key, val]) =>
        `<b>${key} (total):</b> ${val} unidades`
      );

      const totPulido = rawItems.reduce((acc, item) => {
        if (item.pulido) {
          const perimeter = 2 * (item.ancho + item.alto) / 1000 * item.cantidad;
          return acc + perimeter;
        }
        return acc;
      }, 0);

      const itemRows = allInsumos.map(ins =>
        `&nbsp;&nbsp;• <b>[${ins.label}]:</b> ${ins.perimMl.toFixed(3)} ml/ud × ${ins.escuadras / 4} ud = ${ins.totalMl.toFixed(3)} ml`
      ).join('<br/>');

      const summaryBodyParts = [
        `<b>📊 RESUMEN TOTAL DE INSUMOS — ${clientName || 'Cliente'}</b>`,
        `<b>─────────────────────────────</b>`,
        itemRows,
        `<b>─────────────────────────────</b>`,
        ...glassRows,
        ...sepRows,
        `<b>Hotmelt (total):</b> ${totHotmelt.toFixed(3)} ml`,
        `<b>Sal deshidratante (total):</b> ${totSal.toFixed(3)} ml`,
        `<b>Butilo (total):</b> ${totButilo.toFixed(3)} ml`,
        ...escRows,
      ];
      if (totPulido > 0) {
        summaryBodyParts.push(`<b>Pulido (total):</b> ${totPulido.toFixed(3)} ml`);
      }
      const summaryBody = summaryBodyParts.join('<br/>');

      await odoo.executeKw('sale.order', 'message_post', [[saleOrderId]], {
        body: summaryBody,
        message_type: 'comment',
        subtype_xmlid: 'mail.mt_note',
      });
    } catch (e) {
      console.error('Error al publicar resumen de insumos en la SO:', e);
    }

    // --- NUEVO: GENERACIÓN DE ORDEN DE COMPRA (COMPRAS) EN ODOO ---
    try {
      const todayStr = new Date().toISOString().split('T')[0] + ' 12:00:00';
      const aggregatedProducts: Record<number, {
        product_id: number;
        name: string;
        product_qty: number;
        product_uom_id: number;
      }> = {};

      const addAggregation = (productId: number | null, name: string, qty: number, uomId: number | null) => {
        if (!productId || !uomId) return;
        if (aggregatedProducts[productId]) {
          aggregatedProducts[productId].product_qty += qty;
        } else {
          aggregatedProducts[productId] = {
            product_id: productId,
            name,
            product_qty: qty,
            product_uom_id: uomId
          };
        }
      };

      const glassUomId = uomM2Id || uomUnitsId || 1;

      // Consolidar cantidades de todos los rawItems
      rawItems.forEach(item => {
        const perimMl = 2 * (item.ancho + item.alto) / 1000;
        const totalMl = parseFloat((perimMl * item.cantidad).toFixed(3));
        const escuadraKey = getEscuadraName(item.separador.espesor);
        const escuadrasId = escuadraProductMap[escuadraKey];
        const escuadrasQty = 4 * item.cantidad;
        const sepKey = `${item.separador.espesor}_${item.separador.color}`.toLowerCase();
        const sepProductId = separadorProductMap[sepKey];

        const glassArea = (item.ancho / 1000) * (item.alto / 1000) * item.cantidad;
        const glassAreaQty = parseFloat(glassArea.toFixed(3));

        const c1Key = getGlassOdooName(item.cristal1.tipo, item.cristal1.espesor);
        const c2Key = getGlassOdooName(item.cristal2.tipo, item.cristal2.espesor);

        // Cristales
        addAggregation(glassProductMap[c1Key], c1Key, glassAreaQty, glassUomId);
        addAggregation(glassProductMap[c2Key], c2Key, glassAreaQty, glassUomId);

        // Separador
        if (sepProductId) {
          const sepName = item.separador.espesor === 10 ? 'Separador porta sal silica 10 mm' : (item.separador.espesor === 6 ? 'Separador Porta sal silica 6mm' : `Separador Perfil porta sal ${item.separador.espesor} mm`);
          addAggregation(sepProductId, sepName, totalMl, uomMetrosId);
        }

        // Hotmelt, Butilo, Sal
        addAggregation(hotmeltId, 'Hotmelt para DVH ', totalMl, uomMetrosId);
        addAggregation(builoId, 'Butilo para DVH', totalMl, uomMetrosId);
        addAggregation(salId, 'Sal silica Gel 1 kg.', totalMl, uomMetrosId);

        // Escuadras
        addAggregation(escuadrasId, escuadraKey, escuadrasQty, uomUnitsId);

        // Pulido
        if (item.pulido && pulidoId) {
          addAggregation(pulidoId, 'Pulido', totalMl, uomMetrosId);
        }
      });

      const poLines = Object.values(aggregatedProducts).map(p => [
        0, 0, {
          product_id: p.product_id,
          name: p.name,
          product_qty: parseFloat(p.product_qty.toFixed(3)),
          product_uom_id: p.product_uom_id,
          price_unit: 0.0,
          date_planned: todayStr
        }
      ]);

      if (poLines.length > 0) {
        // Buscar o crear proveedor
        const supplierName = "Proveedor de Insumos (Genérico)";
        let supplierId = null;
        const existing = await odoo.executeKw(
          'res.partner', 'search_read',
          [[['name', '=', supplierName]]],
          { fields: ['id'], limit: 1 }
        );
        if (existing && existing.length > 0) {
          supplierId = existing[0].id;
        } else {
          const newPartner = await odoo.executeKw(
            'res.partner', 'create',
            [[{ name: supplierName, is_company: true }]]
          );
          supplierId = Array.isArray(newPartner) ? newPartner[0] : newPartner;
        }

        if (supplierId) {
          const poData = {
            partner_id: supplierId,
            origin: `S${saleOrderId}`,
            order_line: poLines
          };
          const poResult = await odoo.executeKw('purchase.order', 'create', [[poData]]);
          const poId = Array.isArray(poResult) ? poResult[0] : poResult;
          
          const poInfo = await odoo.executeKw('purchase.order', 'read', [[poId]], { fields: ['name'] });
          const poName = poInfo && poInfo.length > 0 ? poInfo[0].name : `PO${poId}`;
          
          await odoo.executeKw('sale.order', 'message_post', [[saleOrderId]], {
            body: `<b>🛒 Orden de Compra Generada:</b> Se ha creado la solicitud de presupuesto <b>${poName}</b> con los materiales e insumos de esta cotización.`,
            message_type: 'comment',
            subtype_xmlid: 'mail.mt_note',
          });
        }
      }
    } catch (poErr) {
      console.error('Error al generar la Orden de Compra (compras) en Odoo:', poErr);
    }

    return moIds;
  }

  // --- CONSULTA Y EDICIÓN DE COTIZACIONES EXISTENTES ---

  /**
   * Obtiene órdenes de venta con filtros y paginación.
   */
  async getOrders(params: OrderSearchParams = {}): Promise<{ orders: SaleOrder[]; total: number }> {
    const { search = '', state = '', limit = 15, offset = 0, orderBy } = params;

    const domain: any[] = [];

    if (state) {
      domain.push(['state', '=', state]);
    }

    if (search.trim()) {
      domain.push('|');
      domain.push(['name', 'ilike', search.trim()]);
      domain.push(['partner_id.name', 'ilike', search.trim()]);
    }

    // Filtrar por la etiqueta de Termopanel
    const tagId = await this.getOrCreateTermopanelTagId();
    if (tagId) {
      domain.push(['tag_ids', 'in', [tagId]]);
    }

    const [orders, total] = await Promise.all([
      odoo.executeKw(
        'sale.order',
        'search_read',
        [domain],
        {
          fields: ['id', 'name', 'partner_id', 'state', 'amount_total', 'amount_untaxed', 'amount_tax', 'date_order', 'user_id'],
          order: orderBy || 'id desc',
          limit,
          offset,
        }
      ),
      odoo.executeKw(
        'sale.order',
        'search_count',
        [domain],
        {}
      ),
    ]);

    return { orders, total };
  }

  /**
   * Obtiene el detalle completo de una orden de venta, incluyendo sus líneas.
   */
  async getOrderDetail(orderId: number): Promise<OrderDetail | null> {
    const orders = await odoo.executeKw(
      'sale.order',
      'search_read',
      [[['id', '=', orderId]]],
      {
        fields: ['id', 'name', 'partner_id', 'state', 'amount_total', 'amount_untaxed', 'amount_tax', 'date_order', 'user_id', 'note', 'order_line'],
        limit: 1,
      }
    );

    if (!orders || orders.length === 0) return null;

    const order = orders[0];

    // Obtener las líneas con detalle
    const lineIds: number[] = order.order_line || [];
    let lines: OrderLine[] = [];

    if (lineIds.length > 0) {
      lines = await odoo.executeKw(
        'sale.order.line',
        'read',
        [lineIds],
        {
          fields: ['id', 'name', 'product_id', 'product_uom_qty', 'price_unit', 'price_subtotal', 'discount', 'display_type', 'x_studio_ancho_m', 'x_studio_alto_m'],
        }
      );
    }

    return { ...order, order_line: lines };
  }

  /**
   * Actualiza precio unitario, cantidad, descripción y dimensiones de una línea de pedido (solo en órdenes draft).
   */
  async updateOrderLine(
    lineId: number,
    data: {
      price_unit?: number;
      product_uom_qty?: number;
      name?: string;
      x_studio_ancho_m?: number;
      x_studio_alto_m?: number;
      discount?: number;
    }
  ): Promise<void> {
    await odoo.executeKw('sale.order.line', 'write', [[lineId], data]);
  }

  /**
   * Cancela una orden de venta (solo funciona si está en estado draft/borrador).
   */
  async cancelOrder(orderId: number): Promise<void> {
    await odoo.executeKw('sale.order', 'action_cancel', [[orderId]]);
  }

  // --- MONOLÍTICO ---


  async createMonoliticQuote(
    partnerId: number,
    lines: SaleOrderLineInput[],
    rawItems: MonoliticoItemData[],
    autoConfirm = true,
    clientName = '',
    userId?: number,
    note?: string
  ): Promise<{ id: number; name: string }> {
    const orderLinesTuples = lines.map(line => {
      if (line.is_note) return [0, 0, { display_type: 'line_note', name: line.name }];
      return [0, 0, {
        product_id: line.product_id || false,
        name: line.name,
        product_uom_qty: line.product_uom_qty,
        product_uom_id: 1,
        price_unit: line.price_unit,
        ...(line.x_studio_ancho_m !== undefined && { x_studio_ancho_m: line.x_studio_ancho_m }),
        ...(line.x_studio_alto_m !== undefined && { x_studio_alto_m: line.x_studio_alto_m }),
      }];
    });

    const tagId = await this.getOrCreateTermopanelTagId();
    const orderData: any = { partner_id: partnerId, order_line: orderLinesTuples };
    if (userId) orderData.user_id = userId;
    if (tagId) {
      orderData.tag_ids = [[6, 0, [tagId]]];
    }
    if (note) {
      orderData.note = note;
    }
    const newOrderId = await odoo.executeKw('sale.order', 'create', [[orderData]]);
    const orderId = Array.isArray(newOrderId) ? newOrderId[0] : newOrderId;

    await this.forceLinePrices(orderId, lines);

    if (autoConfirm) {
      await this.confirmOrder(orderId);
      try {
        await this.createMonoliticManufacturingOrders(orderId, lines, rawItems, clientName);
      } catch (err) {
        console.error("Error creating monolithic manufacturing orders:", err);
      }
    }

    const orderDataResp = await odoo.executeKw('sale.order', 'search_read', [[['id', '=', orderId]]], { fields: ['name'], limit: 1 });
    const orderName = orderDataResp.length > 0 ? orderDataResp[0].name : `SO${orderId}`;

    return { id: orderId, name: orderName };
  }

  async createMonoliticManufacturingOrders(
    saleOrderId: number,
    lines: SaleOrderLineInput[],
    rawItems: MonoliticoItemData[],
    clientName = ''
  ): Promise<number[]> {
    const productLines = lines.filter(l => !l.is_note && l.product_id && l.product_uom_qty > 0);
    if (productLines.length === 0) return [];

    const wcCorteId = await this.getWorkCenterId('Taller Corte Vidrio');
    if (!wcCorteId) throw new Error('No se encontró el centro de trabajo "Taller Corte Vidrio"');

    const moDataList = productLines.map((line, i) => {
      const item = rawItems[i];
      const itemLabel = item.label || `V${i + 1}`;
      const fullDesc = `[${itemLabel}] Monolítico ${item.ancho} x ${item.alto} mm | Cristal: ${item.cristal.tipo} ${item.cristal.espesor}mm`;
      return {
        product_id: line.product_id,
        product_qty: line.product_uom_qty,
        origin: `S${saleOrderId}`,
        product_description_variants: fullDesc,
        bom_id: false,
      };
    });

    const moResult = await odoo.executeKw('mrp.production', 'create', [moDataList]);
    const moIds: number[] = Array.isArray(moResult) ? moResult : [moResult];

    // Confirmar y crear Órdenes de Trabajo para Corte
    const woDataList: any[] = [];
    for (let i = 0; i < moIds.length; i++) {
      const moId = moIds[i];
      const item = rawItems[i];
      await odoo.executeKw('mrp.production', 'action_confirm', [[moId]]);
      const itemLabel = item.label || `V${i + 1}`;
      const sanitizedClient = clientName ? clientName.trim() : 'Sin Cliente';
      const opNameCorte = `${sanitizedClient} - [${itemLabel}] Monolítico | ${item.ancho} x ${item.alto} mm | Cristal: ${item.cristal.tipo} ${item.cristal.espesor}mm`;
      
      woDataList.push({
        name: opNameCorte,
        production_id: moId,
        workcenter_id: wcCorteId,
        duration_expected: 15,
      });
    }

    if (woDataList.length > 0) {
      await odoo.executeKw('mrp.workorder', 'create', [woDataList]);
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
  pulido: boolean;
  micropersiana: boolean;
  palillaje: boolean;
  palillajeColor?: string;
  palillajeHorizontales?: number;
  palillajeVerticales?: number;
  conForma?: boolean;
  tipoFigura?: 'triangulo' | 'trapecio' | 'arco' | 'medio_arco' | 'circulo';
  medidasFigura?: { a: number; b: number; b1?: number; b2?: number };
}

export interface MonoliticoItemData {
  label?: string;
  cantidad: number;
  ancho: number;
  alto: number;
  cristal: { tipo: string; espesor: number };
}

export const odooSales = new OdooSalesService();
