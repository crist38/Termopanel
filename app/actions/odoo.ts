'use server'

import { odooCustomers } from '@/lib/odoo-customers';
import { odooSales } from '@/lib/odoo-sales';

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
    const lineas = data.items.map((item) => {
      const desc = `Termopanel ${item.ancho}x${item.alto}mm
Cristal 1: ${item.cristal1.tipo} ${item.cristal1.espesor}mm
Cristal 2: ${item.cristal2.tipo} ${item.cristal2.espesor}mm
Separador: ${item.separador.espesor}mm ${item.separador.color}`;

      return {
        name: desc,
        product_uom_qty: item.cantidad,
        price_unit: item.precioUnitario
      };
    });

    // Si hay observaciones, agregamos una línea de nota al final (opcional pero útil)
    if (data.observations) {
      lineas.push({
        name: `Observaciones / Dirección: ${data.clientAddress} - ${data.observations}`,
        product_uom_qty: 0,
        price_unit: 0
      });
    }

    // 3. Crear cotización en Odoo
    const cotizacionId = await odooSales.createQuote(clienteId, lineas);

    return { exito: true, cotizacionId };
  } catch (error: any) {
    console.error('Error en Server Action Odoo:', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
}
