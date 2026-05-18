import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { PRECIOS_VIDRIOS, Vidrio } from './data/vidrios';

export interface TermopanelConfig {
  vidrios: Vidrio[];
  separadores: number[];
  coloresSeparador: string[];
}

const DEFAULT_CONFIG: TermopanelConfig = {
  vidrios: PRECIOS_VIDRIOS,
  separadores: [6, 8, 10, 12],
  coloresSeparador: ["Mate", "Negro", "Bronce"]
};

export async function getTermopanelConfig(): Promise<TermopanelConfig> {
  try {
    const docRef = doc(db, 'configuracion', 'termopaneles');
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as TermopanelConfig;
    } else {
      // Inicializar con valores por defecto si no existe
      await setDoc(docRef, DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
  } catch (error) {
    console.error("Error fetching config:", error);
    return DEFAULT_CONFIG; // Fallback a valores por defecto en caso de error
  }
}

export async function saveTermopanelConfig(config: TermopanelConfig): Promise<void> {
  const docRef = doc(db, 'configuracion', 'termopaneles');
  await setDoc(docRef, config);
}
