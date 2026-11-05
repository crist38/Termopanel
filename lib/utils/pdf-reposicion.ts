import jsPDF from 'jspdf';
import type { PiezaReposicion, ReposicionGuardada } from '@/lib/reposiciones';

interface DatosOT {
  ticketRef: string;
  reposicion: ReposicionGuardada;
}

interface Cristal {
  tipo: string;
  espesor: number;
}

interface FilaOT {
  ref: string;
  cantidad: number;
  ancho: number;
  alto: number;
  termopanel: boolean;
  cristal1: Cristal | null;
  cristal2: Cristal | null;
  separador: { espesor: number; color: string } | null;
}

interface Columna {
  titulo: string;
  x: number;
  valor: (f: FilaOT) => string;
  negrita?: boolean;
}

// Cristales y separador vienen en la descripción de la línea de venta:
// "[V1] | Cantidad: 5 unidades | Termopanel 1760 x 380 mm | Cristal 1: Incoloro 4mm | Cristal 2: Incoloro 4mm | Separador: 12mm color Negro"
function filaDePieza(p: PiezaReposicion): FilaOT {
  const partes = p.nombre.split('|').map(s => s.trim());
  const cristal = (re: RegExp): Cristal | null => {
    const parte = partes.find(s => re.test(s));
    const m = parte?.match(/:\s*(.+?)\s+(\d+)\s*mm/i);
    return m ? { tipo: m[1].trim(), espesor: parseInt(m[2], 10) || 0 } : null;
  };
  const sepParte = partes.find(s => /^separador:/i.test(s));
  const sep = sepParte?.match(/(\d+)\s*mm\s*(?:color\s*)?(.*)$/i);

  return {
    ref: p.ref,
    cantidad: p.cantidad,
    ancho: p.ancho,
    alto: p.alto,
    termopanel: p.tipo === 'termopanel',
    cristal1: p.tipo === 'termopanel' ? cristal(/^cristal 1:/i) : cristal(/^cristal:/i),
    cristal2: p.tipo === 'termopanel' ? cristal(/^cristal 2:/i) : null,
    separador: sep ? { espesor: parseInt(sep[1], 10) || 0, color: (sep[2] || '').trim() || '—' } : null,
  };
}

async function cargarLogo(): Promise<string | null> {
  try {
    const res = await fetch('/logo.png');
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function fechaCorta(fecha: string) {
  const [a, m, d] = fecha.split('-');
  return a && m && d ? `${d}-${m}-${a}` : fecha;
}

function paginaOT(
  pdf: jsPDF,
  datos: DatosOT,
  logo: string | null,
  taller: string,
  color: [number, number, number],
  colorFila: [number, number, number],
  columnas: Columna[],
  filas: FilaOT[],
  pie: string
) {
  const rep = datos.reposicion;
  if (logo) pdf.addImage(logo, 'PNG', 14, 10, 18, 18);

  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text('ORDEN DE TRABAJO', 105, 18, { align: 'center' });
  pdf.setFontSize(11);
  pdf.setTextColor(185, 28, 28);
  pdf.text('REPOSICIÓN / REPARACIÓN', 105, 25, { align: 'center' });
  pdf.setFontSize(12);
  pdf.setTextColor(80, 80, 80);
  pdf.text(taller, 105, 32, { align: 'center' });

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 100, 100);
  pdf.text(`Ticket: #${datos.ticketRef}`, 196, 12, { align: 'right' });
  pdf.text(`Venta: ${rep.orderName}`, 196, 18, { align: 'right' });
  pdf.text(`Fecha: ${fechaCorta(rep.fecha)}`, 196, 24, { align: 'right' });
  pdf.text(`Cliente: ${rep.partnerName}`, 196, 30, { align: 'right' });
  pdf.setTextColor(0, 0, 0);

  pdf.setDrawColor(200, 200, 200);
  pdf.line(14, 38, 196, 38);

  let yPos = 44;
  if (rep.motivo) {
    pdf.setFontSize(9);
    const lineas: string[] = pdf.splitTextToSize(`Motivo: ${rep.motivo}`, 176);
    const alto = lineas.length * 4.2 + 4;
    pdf.setFillColor(254, 242, 242);
    pdf.setDrawColor(254, 202, 202);
    pdf.rect(14, yPos - 1, 182, alto, 'FD');
    pdf.setTextColor(127, 29, 29);
    pdf.text(lineas, 17, yPos + 3.5);
    pdf.setTextColor(0, 0, 0);
    yPos += alto + 4;
  }

  yPos += 6;
  const encabezado = () => {
    pdf.setFillColor(...color);
    pdf.rect(14, yPos - 6, 182, 9, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    columnas.forEach(c => pdf.text(c.titulo, c.x, yPos));
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
    yPos += 8;
  };
  encabezado();

  filas.forEach((f, index) => {
    const splitRef = pdf.splitTextToSize(f.ref, columnas[1].x - columnas[0].x - 2);
    const rowHeight = Math.max(8, splitRef.length * 4 + 4);
    if (yPos + rowHeight > 260) {
      pdf.addPage();
      yPos = 20;
      encabezado();
    }
    if (index % 2 === 0) {
      pdf.setFillColor(...colorFila);
      pdf.rect(14, yPos - 5, 182, rowHeight, 'F');
    }
    pdf.setFontSize(9);
    pdf.text(splitRef, columnas[0].x, yPos);
    columnas.slice(1).forEach(c => {
      pdf.setFont('helvetica', c.negrita ? 'bold' : 'normal');
      pdf.text(c.valor(f), c.x, yPos);
    });
    pdf.setFont('helvetica', 'normal');
    yPos += rowHeight;
  });

  pdf.setDrawColor(200, 200, 200);
  pdf.line(14, yPos, 196, yPos);
  yPos += 8;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text(pie, 14, yPos);

  // Firmas de control
  const yFirma = Math.max(yPos + 25, 255);
  if (yFirma < 285) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    pdf.line(24, yFirma, 84, yFirma);
    pdf.line(126, yFirma, 186, yFirma);
    pdf.text('Realizado por', 54, yFirma + 4, { align: 'center' });
    pdf.text('Revisado por', 156, yFirma + 4, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
  }
}

/**
 * PDF con las órdenes de trabajo de una reposición (Taller Corte Vidrio y, si hay
 * termopaneles, Taller Termopaneles), solo con las piezas que se rehacen.
 */
export async function imprimirOTReposicion(datos: DatosOT) {
  const pdf = new jsPDF();
  const logo = await cargarLogo();
  const filas = datos.reposicion.items.map(filaDePieza);
  const termo = filas.filter(f => f.termopanel);
  const m2 = (fs: FilaOT[]) => fs.reduce((s, f) => s + (f.ancho * f.alto * f.cantidad) / 1_000_000, 0);
  const txt = (c: Cristal | null) => (c ? `${c.tipo} ${c.espesor}mm` : '—');

  const cristales = filas.reduce((s, f) => s + f.cantidad * (f.termopanel ? 2 : 1), 0);
  paginaOT(
    pdf, datos, logo, 'Taller Corte Vidrio', [51, 65, 85], [248, 250, 252],
    [
      { titulo: 'Ref', x: 17, valor: f => f.ref },
      { titulo: 'Ancho (mm)', x: 36, valor: f => `${f.ancho}`, negrita: true },
      { titulo: 'Alto (mm)', x: 58, valor: f => `${f.alto}`, negrita: true },
      { titulo: 'Cant.', x: 77, valor: f => `${f.cantidad}` },
      { titulo: 'Cristal 1', x: 89, valor: f => txt(f.cristal1) },
      { titulo: 'Cant.', x: 138, valor: f => (f.cristal2 ? `${f.cantidad}` : '—') },
      { titulo: 'Cristal 2', x: 150, valor: f => txt(f.cristal2) },
    ],
    filas,
    `Total a cortar: ${m2(filas).toFixed(2)} m² (${cristales} cristal${cristales !== 1 ? 'es' : ''})`
  );

  if (termo.length > 0) {
    const unidades = termo.reduce((s, f) => s + f.cantidad, 0);
    pdf.addPage();
    paginaOT(
      pdf, datos, logo, 'Taller Termopaneles', [15, 118, 110], [240, 253, 250],
      [
        { titulo: 'Ref', x: 17, valor: f => f.ref },
        { titulo: 'Cant.', x: 47, valor: f => `${f.cantidad}` },
        { titulo: 'Ancho', x: 58, valor: f => `${f.ancho}`, negrita: true },
        { titulo: 'Alto', x: 73, valor: f => `${f.alto}`, negrita: true },
        { titulo: 'Cristal 1', x: 88, valor: f => txt(f.cristal1) },
        { titulo: 'Cristal 2', x: 121, valor: f => txt(f.cristal2) },
        { titulo: 'Sep. (mm)', x: 154, valor: f => (f.separador ? `${f.separador.espesor}` : '—'), negrita: true },
        { titulo: 'Color Sep.', x: 175, valor: f => f.separador?.color ?? '—', negrita: true },
      ],
      termo,
      `Total a armar: ${m2(termo).toFixed(2)} m² (${unidades} termopanel${unidades !== 1 ? 'es' : ''})`
    );
  }

  const cliente = (datos.reposicion.partnerName || 'Sin_Cliente').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  pdf.save(`OT_Reposicion_${datos.ticketRef}_${datos.reposicion.orderName}_${cliente}.pdf`);
}
