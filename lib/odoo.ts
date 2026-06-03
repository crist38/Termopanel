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

    // Timeout de 60 segundos por llamada
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);

    let response: Response;
    try {
      response = await fetch(`${this.url}/jsonrpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') {
        throw new Error('Timeout: Odoo no respondió en 30 segundos. Intente nuevamente.');
      }
      throw new Error(`Error de red al conectar con Odoo (${this.url}): ${err?.message ?? err}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status} desde Odoo: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Odoo RPC Error: ${data.error.data?.message || data.error.message}`);
    }

    return data.result;
  }

  /**
   * Autentica el cliente y obtiene el User ID (uid) necesario para las consultas.
   * Si ya tenemos uid cacheado, lo reutiliza.
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
      this.uid = null;
      throw new Error('Falló la autenticación con Odoo. Verifica tus credenciales.');
    }

    this.uid = result;
    return result as number;
  }

  /**
   * Ejecuta un método en un modelo de Odoo (equivalente a execute_kw en XML-RPC)
   */
  public async executeKw(model: string, method: string, args: any[] = [], kwargs: Record<string, any> = {}): Promise<any> {
    const uid = await this.authenticate();

    try {
      return await this.rpcCall('object', 'execute_kw', [
        this.db,
        uid,
        this.apiKey,
        model,
        method,
        args,
        kwargs,
      ]);
    } catch (err: any) {
      // Si el error sugiere sesión inválida, limpiar uid para re-autenticar en el próximo intento
      const msg = err?.message ?? '';
      if (msg.includes('Session') || msg.includes('Access Denied') || msg.includes('auth')) {
        this.uid = null;
      }
      throw err;
    }
  }
}

// Exportamos una instancia lista para usar
export const odoo = new OdooClient();
