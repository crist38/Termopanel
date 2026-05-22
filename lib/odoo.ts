export class OdooClient {
  private url: string;
  private db: string;
  private username: string;
  private apiKey: string;
  private uid: number | null = null;

  constructor() {
    this.url = process.env.ODOO_URL || '';
    this.db = process.env.ODOO_DB || '';
    this.username = process.env.ODOO_USERNAME || '';
    this.apiKey = process.env.ODOO_API_KEY || '';

    if (!this.url || !this.db || !this.username || !this.apiKey) {
      console.warn('OdooClient: Faltan variables de entorno para conectar con Odoo.');
    }
  }

  /**
   * Método interno para realizar peticiones JSON-RPC a Odoo
   */
  private async rpcCall(service: 'common' | 'object', method: string, args: any[]): Promise<any> {
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service,
        method,
        args,
      },
      id: Math.floor(Math.random() * 1000000000),
    };

    const response = await fetch(`${this.url}/jsonrpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Error en la petición HTTP: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Odoo RPC Error: ${data.error.data?.message || data.error.message}`);
    }

    return data.result;
  }

  /**
   * Autentica el cliente y obtiene el User ID (uid) necesario para las consultas
   */
  public async authenticate(): Promise<number> {
    if (this.uid) return this.uid;

    const result = await this.rpcCall('common', 'authenticate', [
      this.db,
      this.username,
      this.apiKey,
      {},
    ]);

    if (!result) {
      throw new Error('Falló la autenticación con Odoo. Verifica tus credenciales.');
    }

    this.uid = result;
    return this.uid;
  }

  /**
   * Ejecuta un método en un modelo de Odoo (equivalente a execute_kw en XML-RPC)
   * @param model Nombre del modelo de Odoo (ej: 'res.partner')
   * @param method Método a ejecutar (ej: 'search_read', 'create', 'write')
   * @param args Argumentos posicionales para el método
   * @param kwargs Argumentos con nombre (keywords) opcionales
   */
  public async executeKw(model: string, method: string, args: any[] = [], kwargs: Record<string, any> = {}): Promise<any> {
    const uid = await this.authenticate();

    return this.rpcCall('object', 'execute_kw', [
      this.db,
      uid,
      this.apiKey,
      model,
      method,
      args,
      kwargs,
    ]);
  }
}

// Exportamos una instancia lista para usar
export const odoo = new OdooClient();
