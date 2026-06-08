'use server'

import { odooCustomers } from '@/lib/odoo-customers';
import { odooSales, SaleOrderLineInput, TermopanelItemData } from '@/lib/odoo-sales';
import { getSession } from '@/app/actions/auth';

export async function guardarCotizacionEnOdoo(data: {
  clientName: string;
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

    const lineas: SaleOrderLineInput[] = data.items.map((item, index) => {
      const extras = [];
      if (item.gas) extras.push('Gas Argón');
      if (item.micropersiana) extras.push('Micropersiana');
      if (item.palillaje) extras.push('Palillaje');

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
      gas: item.gas,
      micropersiana: item.micropersiana,
      palillaje: item.palillaje,
    }));

    // 4. Crear cotización, confirmarla y crear órdenes de fabricación de forma síncrona.
    // autoConfirm=true asegura que todo quede creado antes de responder al usuario.
    const session = await getSession();
    const userId = session?.uid;
    const odooQuote = await odooSales.createQuote(clienteId, lineas, rawItems, true, data.clientName, userId);

    return { exito: true, cotizacionId: odooQuote.id, cotizacionName: odooQuote.name };
  } catch (error: any) {
    console.error('Error en Server Action Odoo:', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}

export async function guardarCotizacionMonoliticoEnOdoo(data: {
  clientName: string;
  budgetNumber: number;
  items: any[];
  totalNeto: number;
}) {
  try {
    if (!data.clientName) {
      return { exito: false, error: 'El nombre del cliente es obligatorio' };
    }

    const clienteId = await odooCustomers.getOrCreateCustomer({ name: data.clientName });

    if (!process.env.ODOO_DEFAULT_PRODUCT_ID) {
      return { exito: false, error: 'Variable de entorno ODOO_DEFAULT_PRODUCT_ID no configurada en el servidor.' };
    }
    const defaultProductId = parseInt(process.env.ODOO_DEFAULT_PRODUCT_ID);

    const lineas: SaleOrderLineInput[] = data.items.map((item, index) => {
      const itemLabel = item.label || `V${index + 1}`;
      const desc = `[${itemLabel}] Cantidad: ${item.cantidad} | Cristal Monolítico ${item.ancho} x ${item.alto} mm | Cristal: ${item.cristal.tipo} ${item.cristal.espesor}mm`;

      const anchoM = item.ancho / 1000;
      const altoM = (item.alto / 1000) * item.cantidad;
      const qtyRounded = Math.round(anchoM * altoM * 100) / 100;
      const totalPrice = item.precioUnitario * item.cantidad;
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

    const rawItems = data.items.map((item, index) => ({
      label: item.label || `V${index + 1}`,
      cantidad: item.cantidad,
      ancho: item.ancho,
      alto: item.alto,
      cristal: { tipo: item.cristal.tipo, espesor: item.cristal.espesor },
    }));

    const session = await getSession();
    const userId = session?.uid;
    const odooQuote = await odooSales.createMonoliticQuote(clienteId, lineas, rawItems, true, data.clientName, userId);
    return { exito: true, cotizacionId: odooQuote.id, cotizacionName: odooQuote.name };
  } catch (error: any) {
    console.error('Error en Server Action Odoo (Monolítico):', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}

