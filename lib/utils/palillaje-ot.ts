import type jsPDF from 'jspdf';

/** Palillaje de un termopanel, tal como lo necesita el Taller Termopaneles. */
export interface PalillajeOT {
  color: string;
  horizontales: number;
  verticales: number;
}

interface ItemConPalillaje {
  palillaje?: boolean;
  palillajeColor?: string;
  palillajeHorizontales?: number;
  palillajeVerticales?: number;
}

/** Palillaje de un ítem del cotizador (null si no lleva). */
export function palillajeDeItem(item: ItemConPalillaje): PalillajeOT | null {
  if (!item.palillaje) return null;
  return {
    color: item.palillajeColor || 'Blanco',
    horizontales: item.palillajeHorizontales || 0,
    verticales: item.palillajeVerticales || 0,
  };
}

/**
 * Lee el palillaje desde la descripción de una línea de venta de Odoo. Acepta los formatos que
 * genera la app:
 *   "Palillaje (Blanco, 2 horizontales, 1 verticales)"   (o "... 2 horizontales y 1 verticales")
 *   "Palillaje: SI (Color: Blanco, H: 2, V: 1)"
 *   "Palillaje: Blanco H:2 V:1"
 */
export function palillajeDeTexto(texto: string): PalillajeOT | null {
  const idx = texto.toLowerCase().indexOf('palillaje');
  if (idx === -1) return null;

  let seg = texto.slice(idx).split(/\||\n/)[0];
  const cierre = seg.indexOf(')');
  if (seg.includes('(') && cierre !== -1) seg = seg.slice(0, cierre + 1);
  if (/^palillaje\s*:\s*no\b/i.test(seg)) return null;

  const color =
    seg.match(/color\s*:\s*([^,)]+)/i)?.[1] ??
    seg.match(/\(\s*([^,)\d][^,)]*)/)?.[1] ??
    seg.match(/^palillaje\s*:\s*(.+?)\s+h\s*:/i)?.[1] ??
    'Blanco';

  const numero = (re1: RegExp, re2: RegExp) => {
    const m = seg.match(re1) ?? seg.match(re2);
    return m ? parseInt(m[1], 10) || 0 : 0;
  };

  return {
    color: color.trim().replace(/^si\b\s*/i, '') || 'Blanco',
    horizontales: numero(/(\d+)\s*horizontal/i, /\bh\s*:\s*(\d+)/i),
    verticales: numero(/(\d+)\s*vertical/i, /\bv\s*:\s*(\d+)/i),
  };
}

export function textoPalillaje(p: PalillajeOT): string {
  const h = `${p.horizontales} horizontal${p.horizontales === 1 ? '' : 'es'}`;
  const v = `${p.verticales} vertical${p.verticales === 1 ? '' : 'es'}`;
  return `PALILLAJE ${p.color.toUpperCase()}:  ${h}  ·  ${v}`;
}

/** Alto extra (mm) que ocupa la línea de palillaje bajo una fila de la OT. */
export const ALTO_LINEA_PALILLAJE = 4.5;

/** Escribe la línea de palillaje destacada (ámbar, negrita) en la posición dada. */
export function dibujarPalillaje(pdf: jsPDF, p: PalillajeOT, x: number, y: number) {
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(180, 83, 9);
  pdf.text(textoPalillaje(p), x, y);
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
}

/** Texto para el pie de la OT: " | Con palillaje: N" (vacío si ninguno lleva). */
export function piePalillaje(items: { cantidad: number; palillaje: PalillajeOT | null }[]): string {
  const n = items.reduce((s, i) => s + (i.palillaje ? i.cantidad : 0), 0);
  return n > 0 ? `   |   Con palillaje: ${n}` : '';
}
