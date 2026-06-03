'use server'

import { odooCustomers } from '@/lib/odoo-customers';
import { odooSales, SaleOrderLineInput, TermopanelItemData } from '@/lib/odoo-sales';

export async function guardarCotizacionEnOdoo(data: {
  clientName: string;
  clientAddress: string;
  observations: string;
  budgetNumber: number;
  items: any[];
  totalNeto: number;
}) {
  try {
    if (!data.clientName) {
      return { exito: false, error: 'El nombre del cliente es obligatorio' };
    }

    // 1. Obtener o crear cliente en Odoo
    const clienteId = await odooCustomers.getOrCreateCustomer({
      name: data.clientName,
      // Si en el futuro agregas email o RUT al formulario, pásalos aquí:
      // email: data.clientEmail,
      // vat: data.clientRut
    });

    // 2. Preparar las líneas de la cotización
    // Odoo requiere un product_id válido en cada línea para poder confirmar pedidos.
    // Se usa un producto genérico de tipo "service" configurado en la variable de entorno.
    if (!process.env.ODOO_DEFAULT_PRODUCT_ID) {
      return { exito: false, error: 'Variable de entorno ODOO_DEFAULT_PRODUCT_ID no configurada en el servidor.' };
    }
    const defaultProductId = parseInt(process.env.ODOO_DEFAULT_PRODUCT_ID);

    const lineas: SaleOrderLineInput[] = data.items.map((item) => {
      const extras = [];
      if (item.gas) extras.push('Gas Argón');
      if (item.micropersiana) extras.push('Micropersiana');
      if (item.palillaje) extras.push('Palillaje');

      const desc = [
        `Cantidad: ${item.cantidad} unidad${item.cantidad !== 1 ? 'es' : ''}`,
        `Termopanel ${item.ancho} x ${item.alto} mm`,
        `Cristal 1: ${item.cristal1.tipo} ${item.cristal1.espesor}mm`,
        `Cristal 2: ${item.cristal2.tipo} ${item.cristal2.espesor}mm`,
        `Separador: ${item.separador.espesor}mm color ${item.separador.color}`,
        ...(extras.length > 0 ? [`Extras: ${extras.join(', ')}`] : []),
      ].join(' | ');

      // Usamos UOM = Units (id:1) → cantidad en piezas, precio por pieza
      // IMPORTANTE: No enviar x_studio_ancho_m/alto_m porque Odoo tiene fórmulas
      // que recomputan qty=m² y price_unit=precio_lista del producto.
      // Las dimensiones ya van en el campo 'name' (descripción).
      return {
        product_id: defaultProductId,
        name: desc,
        product_uom_qty: item.cantidad,        // Número de piezas
        price_unit: item.precioUnitario,       // Precio por pieza (igual que la app)
      };
    });

    // Si hay dirección u observaciones, se agrega como línea de NOTA (sin cantidad ni precio)
    const notaParts = [];
    if (data.clientAddress) notaParts.push(`Dirección: ${data.clientAddress}`);
    if (data.observations) notaParts.push(`Obs: ${data.observations}`);
    if (notaParts.length > 0) {
      lineas.push({
        name: notaParts.join(' | '),
        product_uom_qty: 0,
        price_unit: 0,
        is_note: true, // Se renderiza como texto sin afectar el total
      });
    }

    // 3. Preparar datos brutos de los items para las órdenes de trabajo por taller
    const rawItems: TermopanelItemData[] = data.items.map((item) => ({
      cantidad: item.cantidad,
      ancho: item.ancho,
      alto: item.alto,
      cristal1: { tipo: item.cristal1.tipo, espesor: item.cristal1.espesor },
      cristal2: { tipo: item.cristal2.tipo, espesor: item.cristal2.espesor },
      separador: { espesor: item.separador.espesor, color: item.separador.color },
      gas: item.gas,
      micropersiana: item.micropersiana,
      palillaje: item.palillaje,
    }));

    // 4. Crear cotización en Odoo (genera 2 OFs por línea: Corte Vidrio + Termopaneles)
    const cotizacionId = await odooSales.createQuote(clienteId, lineas, rawItems);

    return { exito: true, cotizacionId };
  } catch (error: any) {
    console.error('Error en Server Action Odoo:', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}
