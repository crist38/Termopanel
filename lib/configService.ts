import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { PRECIOS_VIDRIOS, Vidrio } from './data/vidrios';
import { PARAMETROS_DEFAULT, ParametrosCalculo } from './calculos/termopanel';

/**
 * Precio de un tipo/espesor/color de separador por metro lineal (ml).
 * Fuente: hoja1 del Excel "TERMOPANELES PROWINDOWS" → MATRIZ SEPARADORES
 */
export interface PrecioSeparador {
  color: string    // e.g. "Mate", "Bronce", "Champana"
  espesor: number  // mm
  precioPorMl: number // CLP por ml de perimetro
}

export interface TermopanelConfig {
  vidrios: Vidrio[];
  separadores: number[];
  coloresSeparador: string[];
  /** Precios de separadores por ml (color + espesor) */
  preciosSeparadores: PrecioSeparador[];
  /** Parámetros de la fórmula de cálculo (factores GG, venta, perdida, etc.) */
  parametrosCalculo: ParametrosCalculo;
}

/** 
 * Precios de separadores por ml extraídos del Excel (MATRIZ SEPARADORES):
 * - Mate 6mm: 120, 8mm: 128, 9mm: 135, 10mm: 136, 12mm: 132
 * - Bronce 6mm: 120, 8mm: 128, 9mm: 135, 10mm: 185, 12mm: 200
 */
export const PRECIOS_SEPARADORES_DEFAULT: PrecioSeparador[] = [
  // Mate
  { color: 'Mate', espesor: 6,  precioPorMl: 120 },
  { color: 'Mate', espesor: 8,  precioPorMl: 128 },
  { color: 'Mate', espesor: 10, precioPorMl: 136 },
  { color: 'Mate', espesor: 12, precioPorMl: 132 },
  // Bronce
  { color: 'Bronce', espesor: 6,  precioPorMl: 120 },
  { color: 'Bronce', espesor: 8,  precioPorMl: 128 },
  { color: 'Bronce', espesor: 10, precioPorMl: 185 },
  { color: 'Bronce', espesor: 12, precioPorMl: 200 },
  // Negro (igual a Mate como default)
  { color: 'Negro', espesor: 6,  precioPorMl: 120 },
  { color: 'Negro', espesor: 8,  precioPorMl: 128 },
  { color: 'Negro', espesor: 10, precioPorMl: 136 },
  { color: 'Negro', espesor: 12, precioPorMl: 132 },
];

const DEFAULT_CONFIG: TermopanelConfig = {
  vidrios: PRECIOS_VIDRIOS,
  separadores: [6, 8, 10, 12],
  coloresSeparador: ['Mate', 'Negro', 'Bronce'],
  preciosSeparadores: PRECIOS_SEPARADORES_DEFAULT,
  parametrosCalculo: PARAMETROS_DEFAULT,
};

export async function getTermopanelConfig(): Promise<TermopanelConfig> {
  try {
    const docRef = doc(db, 'configuracion', 'termopaneles');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as Partial<TermopanelConfig>;
      // Merge con defaults para que campos nuevos (preciosSeparadores, parametrosCalculo) no sean undefined
      return {
        ...DEFAULT_CONFIG,
        ...data,
        parametrosCalculo: { ...PARAMETROS_DEFAULT, ...(data.parametrosCalculo || {}) },
        preciosSeparadores: data.preciosSeparadores?.length
          ? data.preciosSeparadores
          : PRECIOS_SEPARADORES_DEFAULT,
      };
    }
    return DEFAULT_CONFIG;
  } catch (error) {
    console.error('Error fetching config:', error);
    return DEFAULT_CONFIG;
  }
}

export async function saveTermopanelConfig(config: TermopanelConfig): Promise<void> {
  const docRef = doc(db, 'configuracion', 'termopaneles');
  await setDoc(docRef, config);
}

/**
 * Obtiene el precio del separador por ml dado el color y espesor.
 * Si no se encuentra exacto, retorna 136 (Mate 10mm como fallback).
 */
export function getPrecioSeparadorPorMl(
  preciosSeparadores: PrecioSeparador[],
  color: string,
  espesor: number
): number {
  const found = preciosSeparadores.find(
    (s) => s.color.toLowerCase() === color.toLowerCase() && s.espesor === espesor
  );
  return found?.precioPorMl ?? 136;
}
