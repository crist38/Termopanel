import type jsPDF from 'jspdf';

/** Pago parcial que el cliente deja a cuenta de un presupuesto. */
export interface Abono {
  id: string;
  /** Fecha en formato YYYY-MM-DD */
  fecha: string;
  monto: number;
  medio: string;
}

export const MEDIOS_PAGO = ['Transferencia', 'Efectivo', 'Tarjeta débito', 'Tarjeta crédito', 'Cheque', 'Otro'];

export function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function nuevoAbono(): Abono {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    fecha: hoyISO(),
    monto: 0,
    medio: MEDIOS_PAGO[0],
  };
}

/** Normaliza lo que venga de Firestore o del borrador local. */
export function leerAbonos(raw: unknown): Abono[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a === 'object')
    .map((a: any) => ({
      id: String(a.id ?? Math.random().toString(36).slice(2)),
      fecha: typeof a.fecha === 'string' ? a.fecha : '',
      monto: Number(a.monto) || 0,
      medio: typeof a.medio === 'string' && a.medio ? a.medio : 'Otro',
    }));
}

export function totalAbonado(abonos: Abono[]): number {
  return abonos.reduce((acc, a) => acc + (a.monto > 0 ? a.monto : 0), 0);
}

/** Solo los abonos con monto, que son los que se guardan y se imprimen. */
export function abonosValidos(abonos: Abono[]): Abono[] {
  return abonos.filter((a) => a.monto > 0);
}

export function formatearFecha(fecha: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [y, m, d] = fecha.split('-');
    return `${d}/${m}/${y}`;
  }
  return fecha || '—';
}

/**
 * Dibuja el registro de abonos y el saldo pendiente en el PDF del presupuesto.
 * Devuelve la nueva posición Y. No dibuja nada si no hay abonos.
 */
export function dibujarAbonosPDF(doc: jsPDF, abonos: Abono[], totalConIva: number, yPos: number): number {
  const lista = abonosValidos(abonos);
  if (lista.length === 0) return yPos;

  const alto = 16 + lista.length * 5.5 + 14;
  if (yPos + alto > 280) {
    doc.addPage();
    yPos = 20;
  }

  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
  const abonado = totalAbonado(lista);
  const saldo = totalConIva - abonado;

  yPos += 12;
  doc.setFillColor(240, 240, 240);
  doc.rect(14, yPos - 5, 182, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text('REGISTRO DE ABONOS', 16, yPos);
  doc.text('Fecha', 70, yPos);
  doc.text('Medio de pago', 100, yPos);
  doc.text('Monto', 194, yPos, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  yPos += 2;
  lista.forEach((a, i) => {
    yPos += 5.5;
    doc.text(`Abono ${i + 1}`, 16, yPos);
    doc.text(formatearFecha(a.fecha), 70, yPos);
    doc.text(a.medio, 100, yPos);
    doc.text(fmt(a.monto), 194, yPos, { align: 'right' });
  });

  yPos += 3;
  doc.setDrawColor(200, 200, 200);
  doc.line(120, yPos, 196, yPos);
  yPos += 5.5;
  doc.setFont('helvetica', 'bold');
  doc.text('Total abonado:', 140, yPos);
  doc.text(fmt(abonado), 194, yPos, { align: 'right' });
  yPos += 6;
  doc.setFontSize(11);
  if (saldo > 0) doc.setTextColor(180, 30, 30);
  else doc.setTextColor(20, 120, 80);
  doc.text(saldo > 0 ? 'Saldo pendiente:' : 'Saldo pendiente (pagado):', saldo > 0 ? 140 : 118, yPos);
  doc.text(fmt(Math.max(saldo, 0)), 194, yPos, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);

  return yPos;
}
