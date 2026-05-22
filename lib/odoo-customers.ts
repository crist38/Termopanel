import { odoo } from './odoo';

/**
 * Interface que representa a un cliente/contacto en Odoo
 */
export interface OdooCustomer {
  id: number;
  name: string;
  email: string | false;
  vat: string | false; // RUT, DNI, Identificación tributaria
  phone: string | false;
}

/**
 * Datos para crear un cliente nuevo
 */
export interface CustomerInput {
  name: string;
  email?: string;
  vat?: string; // RUT
  phone?: string;
  is_company?: boolean;
}

export class OdooCustomersService {
  /**
   * Busca clientes por email o rut
   */
  async searchCustomer(query: string): Promise<OdooCustomer[]> {
    return odoo.executeKw(
      'res.partner',
      'search_read',
      [
        ['|', ['email', 'ilike', query], ['vat', 'ilike', query]] // Busca coincidencias en email OR vat
      ],
      {
        fields: ['id', 'name', 'email', 'vat', 'phone'],
        limit: 10,
      }
    );
  }

  /**
   * Busca un cliente por su RUT/VAT exacto
   */
  async getCustomerByVat(vat: string): Promise<OdooCustomer | null> {
    const customers = await odoo.executeKw(
      'res.partner',
      'search_read',
      [
        [['vat', '=', vat]]
      ],
      {
        fields: ['id', 'name', 'email', 'vat', 'phone'],
        limit: 1,
      }
    );
    return customers.length > 0 ? customers[0] : null;
  }

  /**
   * Busca un cliente por su email exacto
   */
  async getCustomerByEmail(email: string): Promise<OdooCustomer | null> {
    const customers = await odoo.executeKw(
      'res.partner',
      'search_read',
      [
        [['email', '=', email]]
      ],
      {
        fields: ['id', 'name', 'email', 'vat', 'phone'],
        limit: 1,
      }
    );
    return customers.length > 0 ? customers[0] : null;
  }

  /**
   * Crea un cliente nuevo en Odoo
   */
  async createCustomer(data: CustomerInput): Promise<number> {
    const customerData = {
      name: data.name,
      email: data.email || false,
      vat: data.vat || false,
      phone: data.phone || false,
      is_company: data.is_company || false,
    };

    const newCustomerId = await odoo.executeKw(
      'res.partner',
      'create',
      [[customerData]]
    );

    // Odoo return array of IDs when creating, so we extract the first one
    return Array.isArray(newCustomerId) ? newCustomerId[0] : newCustomerId;
  }

  /**
   * Función útil que busca si existe el cliente por RUT o Email, y si no existe lo crea automáticamente.
   * Retorna el ID del cliente para ser usado en la cotización.
   */
  async getOrCreateCustomer(data: CustomerInput): Promise<number> {
    // 1. Intentar buscar por RUT
    if (data.vat) {
      const existing = await this.getCustomerByVat(data.vat);
      if (existing) return existing.id;
    }

    // 2. Intentar buscar por Email si no se encontró por RUT
    if (data.email) {
      const existing = await this.getCustomerByEmail(data.email);
      if (existing) return existing.id;
    }

    // 3. Si no existe, lo creamos
    return await this.createCustomer(data);
  }
}

export const odooCustomers = new OdooCustomersService();
