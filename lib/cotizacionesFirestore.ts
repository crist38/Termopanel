import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * Cotizaciones guardadas en Firestore mientras Odoo está suspendido.
 * Cada colección tiene su propio correlativo en `contadores/{coleccion}`.
 */
export type ColeccionCotizacion =
  | 'presupuestos_termopaneles'
  | 'presupuestos_monoliticos'
  | 'presupuestos_formas';

export const PREFIJOS: Record<ColeccionCotizacion, string> = {
  presupuestos_termopaneles: 'TP',
  presupuestos_monoliticos: 'MO',
  presupuestos_formas: 'FO',
};

/** Página del cotizador que edita cada colección */
export const RUTAS: Record<ColeccionCotizacion, string> = {
  presupuestos_termopaneles: '/',
  presupuestos_monoliticos: '/monolitico',
  presupuestos_formas: '/formas',
};

export function firebaseConfigurado(): boolean {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  return !!apiKey && !apiKey.startsWith('AIzaSyDummyKey');
}

/** true si el error de Odoo es por falta de sesión (login desactivado) */
export function esErrorSinSesion(error?: string): boolean {
  return !!error && error.startsWith('No autorizado');
}

/** true si el editId corresponde a un documento de Firestore (los de Odoo son numéricos) */
export function esIdFirestore(editId?: string | null): editId is string {
  return !!editId && !/^\d+$/.test(editId);
}

export interface DatosCotizacion {
  clientId?: number;
  clientName: string;
  clientRut?: string;
  obra?: string;
  fechaEntrega?: string;
  items: unknown[];
  totalNeto: number;
}

export interface ResultadoGuardado {
  exito: boolean;
  id?: string;
  cotizacionName?: string;
  error?: string;
}

// Firestore no acepta `undefined`: se eliminan esos campos antes de guardar.
function limpiar<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

/**
 * Crea una cotización nueva (con número correlativo) o actualiza una existente si se pasa `id`.
 */
export async function guardarCotizacionFirestore(
  coleccion: ColeccionCotizacion,
  datos: DatosCotizacion,
  opciones: { id?: string; confirmada?: boolean } = {}
): Promise<ResultadoGuardado> {
  if (!firebaseConfigurado()) {
    return { exito: false, error: 'Firebase no está configurado (faltan las variables NEXT_PUBLIC_FIREBASE_*).' };
  }

  const base = {
    ...limpiar(datos),
    confirmada: !!opciones.confirmada,
    origen: 'firebase',
    updatedAt: serverTimestamp(),
  };

  try {
    if (opciones.id) {
      const ref = doc(db, coleccion, opciones.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return { exito: false, error: 'La cotización ya no existe en Firebase.' };
      const actual = snap.data();
      await setDoc(ref, { ...base, budgetNumber: actual.budgetNumber, budgetName: actual.budgetName }, { merge: true });
      return { exito: true, id: opciones.id, cotizacionName: actual.budgetName };
    }

    const contadorRef = doc(db, 'contadores', coleccion);
    const nuevaRef = doc(collection(db, coleccion));
    const nombre = await runTransaction(db, async (tx) => {
      const contador = await tx.get(contadorRef);
      const numero = (contador.exists() ? (contador.data().ultimo as number) : 0) + 1;
      const budgetName = `${PREFIJOS[coleccion]}-${String(numero).padStart(4, '0')}`;
      tx.set(contadorRef, { ultimo: numero });
      tx.set(nuevaRef, { ...base, budgetNumber: numero, budgetName, createdAt: serverTimestamp() });
      return budgetName;
    });
    return { exito: true, id: nuevaRef.id, cotizacionName: nombre };
  } catch (error: any) {
    console.error('Error guardando cotización en Firestore:', error);
    return { exito: false, error: error?.message || 'No se pudo guardar en Firebase' };
  }
}

export interface CotizacionFirestore {
  id: string;
  coleccion: ColeccionCotizacion;
  budgetName: string;
  clientName: string;
  obra?: string;
  totalNeto?: number;
  confirmada?: boolean;
  createdAt?: Date;
}

/** Últimas cotizaciones guardadas en Firestore, de las tres colecciones, más recientes primero. */
export async function listarCotizacionesFirestore(porColeccion = 30): Promise<CotizacionFirestore[]> {
  if (!firebaseConfigurado()) return [];
  const colecciones = Object.keys(PREFIJOS) as ColeccionCotizacion[];
  const resultados = await Promise.all(
    colecciones.map(async (coleccion) => {
      const snap = await getDocs(query(collection(db, coleccion), orderBy('createdAt', 'desc'), limit(porColeccion)));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          coleccion,
          budgetName: data.budgetName || 'Sin número',
          clientName: data.clientName || '',
          obra: data.obra,
          totalNeto: data.totalNeto,
          confirmada: data.confirmada,
          createdAt: data.createdAt?.toDate?.(),
        } as CotizacionFirestore;
      });
    })
  );
  return resultados.flat().sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}
