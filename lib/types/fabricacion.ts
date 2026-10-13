import { PuntoFigura } from '@/lib/calculos/termopanel';

export type FiguraFabricacion = 'rectangulo' | 'triangulo' | 'trapecio' | 'arco' | 'medio_arco' | 'circulo' | 'personalizada';

/**
 * Medida de un termopanel adjunta a una cotización de obra (Taller PVC).
 * No lleva precio: el termopanel ya está cobrado dentro de la obra.
 */
export interface MedidaFabricacion {
  ref: string;       // Ventana de la cotización a la que pertenece (ej: "V1")
  cantidad: number;
  ancho: number;     // mm (en figuras, ancho total)
  alto: number;      // mm (en figuras, alto total)
  cristal1: { tipo: string; espesor: number };
  cristal2: { tipo: string; espesor: number };
  separador: { espesor: number; color: string };
  pulido?: boolean;
  micropersiana?: boolean;
  palillaje?: boolean;
  palillajeColor?: string;
  palillajeHorizontales?: number;
  palillajeVerticales?: number;
  tipoFigura?: FiguraFabricacion; // sin valor = rectángulo
  medidasFigura?: { a: number; b: number; b1?: number; b2?: number; r?: number; puntos?: PuntoFigura[] };
  observacion?: string;
}

export interface MedidasGuardadas {
  items: MedidaFabricacion[];
  updatedAt?: string;
  updatedBy?: string;
  /** Presente cuando ya se crearon las órdenes de fabricación en Odoo */
  fabricacion?: EnvioFabricacion;
}

export interface EnvioFabricacion {
  enviadoAt: string;
  enviadoPor?: string;
  moIds: number[];
}

export const NOMBRES_FIGURA: Record<FiguraFabricacion, string> = {
  rectangulo: 'Rectángulo',
  triangulo: 'Triángulo',
  trapecio: 'Trapecio',
  arco: 'Arco',
  medio_arco: 'Medio Arco',
  circulo: 'Círculo',
  personalizada: 'Forma Libre',
};

/** Texto corto con las medidas propias de la figura (vacío para rectángulos). */
export function describirFigura(m: MedidaFabricacion): string {
  const tipo = m.tipoFigura || 'rectangulo';
  const med = m.medidasFigura;
  if (tipo === 'rectangulo' || !med) return '';
  if (tipo === 'arco') return `Arco: Ancho ${med.a}, Alt. Base ${med.b}, R ${med.r || Math.round(med.a / 2)}`;
  if (tipo === 'medio_arco') return `Medio Arco: Ancho ${med.a}, Alt. Recta ${med.b}, Alt. Total ${med.b1 || 0}`;
  if (tipo === 'circulo') return `Círculo: Diámetro ${med.a}`;
  if (tipo === 'triangulo') return `Triángulo: Base ${med.a}, Altura ${med.b}`;
  if (tipo === 'trapecio') return `Trapecio: Ancho ${med.a}, Alt. Izq ${med.b1 || 0}, Alt. Der ${med.b2 || 0}`;
  const puntos = med.puntos || [];
  return `Forma Libre (${puntos.length} puntos): ${puntos.map(p => `${p.x},${p.y}`).join(' · ')}`;
}

export function describirExtras(m: MedidaFabricacion): string[] {
  const extras: string[] = [];
  if (m.pulido) extras.push('Pulido');
  if (m.micropersiana) extras.push('Micropersiana');
  if (m.palillaje) {
    extras.push(`Palillaje (${m.palillajeColor || 'Blanco'}, ${m.palillajeHorizontales || 0} horizontales, ${m.palillajeVerticales || 0} verticales)`);
  }
  return extras;
}
