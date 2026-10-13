import jsPDF from 'jspdf';
import { MedidaFabricacion, describirFigura, describirExtras } from '@/lib/types/fabricacion';
import { drawShapeInPdf } from '@/lib/utils/pdf-figuras';

// Recuadro máximo (mm) del dibujo de una figura bajo su fila
const DIBUJO_W = 24;
const DIBUJO_H = 18;

interface DatosOrden {
  ventaName: string;  // Número de la venta en Odoo (ej: S00552)
  clientName: string;
  medidas: MedidaFabricacion[];
}

interface Columna {
  titulo: string;
  x: number;
  valor: (m: MedidaFabricacion) => string;
  negrita?: boolean;
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
  } catch (e) {
    console.error('Error al cargar el logo en el PDF', e);
    return null;
  }
}

function paginaTaller(
  pdf: jsPDF,
  datos: DatosOrden,
  logo: string | null,
  taller: string,
  color: [number, number, number],
  colorFila: [number, number, number],
  columnas: Columna[],
  xExtras: number,
  pie: string[]
) {
  if (logo) pdf.addImage(logo, 'PNG', 14, 10, 36, 18);

  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text('ORDEN DE TRABAJO', 105, 20, { align: 'center' });
  pdf.setFontSize(13);
  pdf.setTextColor(80, 80, 80);
  pdf.text(taller, 105, 28, { align: 'center' });

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 100, 100);
  pdf.text(`Venta: ${datos.ventaName}`, 196, 13, { align: 'right' });
  pdf.text(`Fecha: ${new Date().toLocaleDateString('es-CL')}`, 196, 20, { align: 'right' });
  pdf.text(`Cliente: ${datos.clientName}`, 196, 27, { align: 'right' });
  pdf.setTextColor(0, 0, 0);

  pdf.setDrawColor(200, 200, 200);
  pdf.line(14, 38, 196, 38);

  let yPos = 48;
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

  datos.medidas.forEach((m, index) => {
    const splitLabel = pdf.splitTextToSize(m.ref || `V${index + 1}`, 28);
    // Figura, extras y observación van en una segunda línea bajo la fila
    const detalle = [describirFigura(m), ...describirExtras(m), m.observacion ? `Obs: ${m.observacion}` : '']
      .filter(Boolean)
      .join(' | ');
    pdf.setFontSize(8);
    // Las figuras se dibujan a escala bajo la fila, con el detalle a su derecha
    const conFigura = !!m.tipoFigura && m.tipoFigura !== 'rectangulo' && !!m.medidasFigura;
    const xDetalle = conFigura ? xExtras + DIBUJO_W + 4 : xExtras;
    const splitDetalle: string[] = detalle ? pdf.splitTextToSize(detalle, 196 - xDetalle - 2) : [];
    const rowHeight = Math.max(
      8,
      splitLabel.length * 4 + 4,
      splitDetalle.length > 0 ? 9 + splitDetalle.length * 3.6 : 0,
      conFigura ? DIBUJO_H + 10 : 0
    );

    if (yPos + rowHeight > 275) {
      pdf.addPage();
      yPos = 20;
      encabezado();
    }

    if (index % 2 === 0) {
      pdf.setFillColor(...colorFila);
      pdf.rect(14, yPos - 5, 182, rowHeight, 'F');
    }

    pdf.setFontSize(9);
    pdf.text(splitLabel, columnas[0].x, yPos);
    columnas.slice(1).forEach(c => {
      pdf.setFont('helvetica', c.negrita ? 'bold' : 'normal');
      pdf.text(c.valor(m), c.x, yPos);
    });
    pdf.setFont('helvetica', 'normal');

    if (splitDetalle.length > 0) {
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text(splitDetalle, xDetalle, yPos + 4.5);
      pdf.setTextColor(0, 0, 0);
    }

    if (conFigura) {
      const escala = Math.min(DIBUJO_W / (m.ancho || 1), DIBUJO_H / (m.alto || 1));
      const w = (m.ancho || 1) * escala;
      const h = (m.alto || 1) * escala;
      drawShapeInPdf(pdf, m.tipoFigura!, xExtras + (DIBUJO_W - w) / 2, yPos + 2 + (DIBUJO_H - h) / 2, w, h, m.medidasFigura!);
    }

    yPos += rowHeight;
  });

  pdf.setDrawColor(200, 200, 200);
  pdf.line(14, yPos, 196, yPos);

  yPos += 8;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text(pie[0], 14, yPos);
  if (pie[1]) {
    yPos += 8;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(120, 120, 120);
    pdf.text(pie[1], 14, yPos);
    pdf.setTextColor(0, 0, 0);
  }
}

/**
 * Genera el PDF de órdenes de trabajo (Taller Corte Vidrio y Taller Termopaneles)
 * con las medidas adjuntas a una venta de Taller PVC.
 */
export async function imprimirOrdenesTaller(datos: DatosOrden) {
  const pdf = new jsPDF();
  const logo = await cargarLogo();
  const totalM2 = datos.medidas.reduce((acc, m) => acc + ((m.ancho * m.alto) / 1_000_000) * m.cantidad, 0);
  const totalUnidades = datos.medidas.reduce((acc, m) => acc + m.cantidad, 0);
  const cristal = (c: { tipo: string; espesor: number }) => `${c.tipo} ${c.espesor}mm`;

  paginaTaller(
    pdf, datos, logo, 'Taller Corte Vidrio', [51, 65, 85], [248, 250, 252],
    [
      { titulo: 'Ref', x: 17, valor: m => m.ref },
      { titulo: 'Ancho (mm)', x: 36, valor: m => `${m.ancho}`, negrita: true },
      { titulo: 'Alto (mm)', x: 58, valor: m => `${m.alto}`, negrita: true },
      { titulo: 'Cant.', x: 78, valor: m => `${m.cantidad}` },
      { titulo: 'Cristal 1', x: 89, valor: m => cristal(m.cristal1) },
      { titulo: 'Cant.', x: 139, valor: m => `${m.cantidad}` },
      { titulo: 'Cristal 2', x: 150, valor: m => cristal(m.cristal2) },
    ],
    36,
    [
      `Total a cortar: ${totalM2.toFixed(2)} m² (${totalUnidades * 2} cristales)`,
      '* Las medidas de los cristales corresponden al termopanel completo. Ajustar descuentos según separador.',
    ]
  );

  pdf.addPage();
  paginaTaller(
    pdf, datos, logo, 'Taller Termopaneles', [15, 118, 110], [240, 253, 250],
    [
      { titulo: 'Ref', x: 17, valor: m => m.ref },
      { titulo: 'Cant.', x: 47, valor: m => `${m.cantidad}` },
      { titulo: 'Ancho', x: 58, valor: m => `${m.ancho}`, negrita: true },
      { titulo: 'Alto', x: 73, valor: m => `${m.alto}`, negrita: true },
      { titulo: 'Cristal 1', x: 88, valor: m => cristal(m.cristal1) },
      { titulo: 'Cristal 2', x: 121, valor: m => cristal(m.cristal2) },
      { titulo: 'Sep. (mm)', x: 154, valor: m => `${m.separador.espesor}`, negrita: true },
      { titulo: 'Color Sep.', x: 175, valor: m => m.separador.color, negrita: true },
    ],
    47,
    [`Total a armar: ${totalM2.toFixed(2)} m² (${totalUnidades} termopanel${totalUnidades !== 1 ? 'es' : ''})`]
  );

  const cliente = datos.clientName ? datos.clientName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : 'Sin_Cliente';
  pdf.save(`Ordenes_Trabajo_${datos.ventaName}_${cliente}.pdf`);
}
