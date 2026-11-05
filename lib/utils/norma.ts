import { TermopanelItem, estaFueraDeNorma } from '@/lib/calculos/termopanel';

type ItemNorma = Pick<TermopanelItem, 'ancho' | 'alto' | 'cristal1' | 'cristal2'>;

/** Referencias (V1, V2...) de los termopaneles que quedan fuera de norma. */
export function refsFueraDeNorma<T extends ItemNorma>(items: T[], getRef: (item: T, index: number) => string): string[] {
  return items.flatMap((item, i) => (estaFueraDeNorma(item) ? [getRef(item, i)] : []));
}

/** Texto de aviso para los termopaneles fuera de norma; vacío si no hay ninguno. */
export function avisoFueraDeNorma(refs: string[]): string {
  if (refs.length === 0) return '';
  const cuantos = refs.length === 1 ? 'Hay 1 termopanel fuera de norma' : `Hay ${refs.length} termopaneles fuera de norma`;
  return `${cuantos} (${refs.join(', ')}): el cristal más grueso es menor al espesor mínimo (m² × 0,65 + 2,5 mm).`;
}

/** Pide confirmación si hay termopaneles fuera de norma. Devuelve true si se puede continuar. */
export function confirmarFueraDeNorma(refs: string[]): boolean {
  if (refs.length === 0) return true;
  return confirm(`${avisoFueraDeNorma(refs)}\n\n¿Deseas continuar igual?`);
}
