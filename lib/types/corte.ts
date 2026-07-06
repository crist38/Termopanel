/**
 * Tipos compartidos para la integracion entre el cotizador de termopaneles
 * y el optimizador de corte GlassOpt.
 */

/** Una pieza individual de vidrio a cortar */
export interface PiezaCorte {
  id: string;
  label: string;    // Ref del termopanel (ej: "V1")
  w: number;        // Ancho en mm
  h: number;        // Alto en mm
  quantity: number; // Cantidad
}

/** Grupo de piezas del mismo tipo y espesor de cristal */
export interface GrupoCorte {
  key: string;       // Clave unica ej: "Incoloro_4_1"
  tipo: string;      // Tipo de vidrio ej: "Incoloro"
  espesor: number;   // Espesor en mm ej: 4
  cristalNum: 1 | 2; // Si es cristal 1 o cristal 2 del termopanel
  piezas: PiezaCorte[];
  totalPiezas: number;  // Suma total considerando quantities
}

/** Payload completo que se guarda en localStorage para importar al optimizador */
export interface CorteImport {
  clientName: string;
  obra?: string;
  grupos: GrupoCorte[];
  timestamp: number;
}

export const CORTE_IMPORT_KEY = 'corte_items_import';
