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

const LOCAL_CONFIG_KEY = 'termopanel_config_local';

function firebaseDisponible(): boolean {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  return !!apiKey && !apiKey.startsWith('AIzaSyDummyKey');
}

/** Copia guardada en este navegador (respaldo si Firebase no responde o no está configurado). */
function leerConfigLocal(): TermopanelConfig | null {
  if (typeof window === 'undefined') return null;
  const local = localStorage.getItem(LOCAL_CONFIG_KEY);
  if (!local) return null;
  try {
    const parsed = JSON.parse(local);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      parametrosCalculo: { ...PARAMETROS_DEFAULT, ...(parsed.parametrosCalculo ?? {}) },
      preciosSeparadores: parsed.preciosSeparadores?.length ? parsed.preciosSeparadores : PRECIOS_SEPARADORES_DEFAULT,
    };
  } catch {
    return null;
  }
}

function guardarConfigLocal(config: TermopanelConfig) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(config));
  } catch {}
}

/**
 * Configuración de precios.
 * Con Firebase configurado, el documento `configuracion/termopaneles` es la fuente de verdad:
 * así un cambio de precio hecho en un equipo se ve en todos. La copia en localStorage
 * solo se usa si Firebase no responde (o si no hay Firebase configurado).
 */
export async function getTermopanelConfig(): Promise<TermopanelConfig> {
  if (!firebaseDisponible()) {
    return leerConfigLocal() ?? DEFAULT_CONFIG;
  }

  try {
    const docRef = doc(db, 'configuracion', 'termopaneles');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as Partial<TermopanelConfig>;
      const rawParams = data.parametrosCalculo || {};
      const parametrosCalculo = {
        ...PARAMETROS_DEFAULT,
        ...rawParams,
      };

      // Migrar costoGasArgon a costoPulido si corresponde
      if (parametrosCalculo.costoPulido === undefined && (rawParams as any).costoGasArgon !== undefined) {
        parametrosCalculo.costoPulido = (rawParams as any).costoGasArgon;
      }

      // Merge con defaults para que campos nuevos (preciosSeparadores, parametrosCalculo) no sean undefined
      const config: TermopanelConfig = {
        ...DEFAULT_CONFIG,
        ...data,
        parametrosCalculo,
        preciosSeparadores: data.preciosSeparadores?.length
          ? data.preciosSeparadores
          : PRECIOS_SEPARADORES_DEFAULT,
      };
      guardarConfigLocal(config);
      return config;
    }
    return leerConfigLocal() ?? DEFAULT_CONFIG;
  } catch (error) {
    console.warn('No se pudo conectar a Firebase Firestore. Usando la última configuración guardada en este equipo.', error);
    return leerConfigLocal() ?? DEFAULT_CONFIG;
  }
}

export async function saveTermopanelConfig(config: TermopanelConfig): Promise<void> {
  guardarConfigLocal(config);

  if (!firebaseDisponible()) {
    return;
  }

  // Si falla, se lanza el error para que la pantalla de configuración avise
  // (antes se decía "guardado" aunque Firebase no lo hubiera recibido).
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
