import jsPDF from 'jspdf';
import { PuntoFigura } from '@/lib/calculos/termopanel';

// Dibuja una figura de termopanel dentro del recuadro (x, y, w, h) de un PDF
export const drawShapeInPdf = (
  doc: jsPDF,
  shape: string,
  x: number,
  y: number,
  w: number,
  h: number,
  med: { a: number; b: number; b1?: number; b2?: number; r?: number; puntos?: PuntoFigura[] }
) => {
  doc.setLineWidth(0.3);
  doc.setDrawColor(71, 85, 105);   // Slate-600
  doc.setFillColor(241, 245, 249); // Slate-100

  if (shape === 'rectangulo') {
    doc.rect(x, y, w, h, 'FD');
  } else if (shape === 'circulo') {
    const r = w / 2;
    const cx = x + w / 2;
    const cy = y + h / 2;
    doc.ellipse(cx, cy, r, r, 'FD');
  } else if (shape === 'triangulo') {
    doc.triangle(x, y + h, x + w, y + h, x, y, 'FD');
  } else if (shape === 'trapecio') {
    const b1 = med.b1 || 0;
    const b2 = med.b2 || 0;
    const maxVal = Math.max(b1, b2) || 1;
    const hLeft = (b1 / maxVal) * h;
    const hRight = (b2 / maxVal) * h;
    
    doc.triangle(x, y + h, x + w, y + h, x + w, y + h - hRight, 'FD');
    doc.triangle(x, y + h, x, y + h - hLeft, x + w, y + h - hRight, 'FD');
  } else if (shape === 'arco') {
    const a = med.a || 1;
    const b = med.b || 0;
    const rVal = med.r !== undefined && med.r > 0 ? med.r : a / 2;
    const maxVal = (b + rVal) || 1;
    
    const hBaseScaled = (b / maxVal) * h;
    const rScaled = (rVal / maxVal) * h;
    
    const yBottom = y + h;
    const yBaseTop = yBottom - hBaseScaled;
    const cx = x + w / 2;
    const rX = w / 2;
    const rY = rScaled;

    if (hBaseScaled > 0) {
      doc.rect(x, yBaseTop, w, hBaseScaled, 'FD');
    }

    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const a1 = i * Math.PI / steps;
      const a2 = (i + 1) * Math.PI / steps;
      const x1 = cx + rX * Math.cos(Math.PI + a1);
      const y1 = yBaseTop - rY * Math.sin(Math.PI + a1);
      const x2 = cx + rX * Math.cos(Math.PI + a2);
      const y2 = yBaseTop - rY * Math.sin(Math.PI + a2);
      doc.triangle(cx, yBaseTop, x1, y1, x2, y2, 'FD');
    }
    
    doc.line(x, yBottom, x + w, yBottom);
    if (hBaseScaled > 0) {
      doc.line(x, yBottom, x, yBaseTop);
      doc.line(x + w, yBottom, x + w, yBaseTop);
    }
    
    for (let i = 0; i < steps; i++) {
      const a1 = i * Math.PI / steps;
      const a2 = (i + 1) * Math.PI / steps;
      const x1 = cx + rX * Math.cos(Math.PI + a1);
      const y1 = yBaseTop - rY * Math.sin(Math.PI + a1);
      const x2 = cx + rX * Math.cos(Math.PI + a2);
      const y2 = yBaseTop - rY * Math.sin(Math.PI + a2);
      doc.line(x1, y1, x2, y2);
    }
  } else if (shape === 'medio_arco') {
    const b = med.b || 0;     // Altura Recta
    const b1 = med.b1 || 0;   // Altura Total
    const maxVal = b1 || 1;
    
    const hRight = (b / maxVal) * h;
    const yBottom = y + h;
    const yRight = yBottom - hRight;
    const rY = h - hRight;
    
    // Parte rectangular base
    doc.rect(x, yRight, w, hRight, 'FD');
    
    // Llenado con triángulos del sector del arco
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const a1 = i * (Math.PI / 2) / steps;
      const a2 = (i + 1) * (Math.PI / 2) / steps;
      const x1 = x + w * Math.cos(a1);
      const y1 = yRight - rY * Math.sin(a1);
      const x2 = x + w * Math.cos(a2);
      const y2 = yRight - rY * Math.sin(a2);
      doc.triangle(x, yRight, x1, y1, x2, y2, 'FD');
    }

    doc.line(x, yBottom, x + w, yBottom);
    doc.line(x + w, yBottom, x + w, yRight);
    doc.line(x, yBottom, x, y);
    for (let i = 0; i < steps; i++) {
      const a1 = i * (Math.PI / 2) / steps;
      const a2 = (i + 1) * (Math.PI / 2) / steps;
      const x1 = x + w * Math.cos(a1);
      const y1 = yRight - rY * Math.sin(a1);
      const x2 = x + w * Math.cos(a2);
      const y2 = yRight - rY * Math.sin(a2);
      doc.line(x1, y1, x2, y2);
    }
  } else if (shape === 'personalizada' && med.puntos && med.puntos.length >= 3) {
    const pts = med.puntos;
    const minX = Math.min(...pts.map(p => p.x));
    const maxX = Math.max(...pts.map(p => p.x));
    const minY = Math.min(...pts.map(p => p.y));
    const maxY = Math.max(...pts.map(p => p.y));
    const scale = Math.min(w / ((maxX - minX) || 1), h / ((maxY - minY) || 1));
    const offX = x + (w - (maxX - minX) * scale) / 2;
    const offY = y + h - (h - (maxY - minY) * scale) / 2;
    const scaled = pts.map(p => [offX + (p.x - minX) * scale, offY - (p.y - minY) * scale]);
    const deltas = scaled.slice(1).map((p, i) => [p[0] - scaled[i][0], p[1] - scaled[i][1]]);
    doc.lines(deltas, scaled[0][0], scaled[0][1], [1, 1], 'FD', true);
  }

  doc.setLineWidth(0.2);
  doc.setDrawColor(0, 0, 0);
  doc.setFillColor(255, 255, 255);
};
