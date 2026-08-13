'use client'

import React, { useState, useEffect, Suspense } from 'react';
import jsPDF from 'jspdf';
import { obtenerDatosReportes, ReportStats } from '@/app/actions/reports';
import { obtenerDetalleCotizacion } from '@/app/actions/odoo';
import {
  DollarSign,
  ClipboardList,
  TrendingUp,
  Box,
  Loader2,
  ArrowLeft,
  Grid,
  Wrench,
  Users,
  Compass,
  FileSpreadsheet,
  RefreshCw,
  Printer,
  Calendar,
  FileText,
  HardHat,
} from 'lucide-react';

// ─── Helpers PDF (misma lógica que /cotizaciones) ─────────────────────────────

function stripHtml(htmlStr: string) {
  if (!htmlStr) return '';
  return htmlStr.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function formatDatePdf(dateStr: string) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function parseOdooLinePdf(line: any, index: number) {
  const name = line.name || '';
  let ref = `L${index + 1}`;
  let cant = line.product_uom_qty?.toString() ?? '1';
  let dim = '—';
  let config = name;
  const parts = name.split(' | ').map((p: string) => p.trim());
  const refMatch = parts[0]?.match(/^\[([^\]]+)\]$/);
  if (refMatch) ref = refMatch[1];
  const cantPart = parts.find((p: string) => p.toLowerCase().includes('cantidad:'));
  if (cantPart) { const m = cantPart.match(/cantidad:\s*(\d+)/i); if (m) cant = m[1]; }
  const dimPart = parts.find((p: string) => p.toLowerCase().includes('termopanel') || p.toLowerCase().includes('cristal monolítico'));
  if (dimPart) { const m = dimPart.match(/(\d+)\s*x\s*(\d+)/i); if (m) dim = `${m[1]} x ${m[2]}`; }
  else if (line.x_studio_ancho_m != null && line.x_studio_alto_m != null) {
    const w = Math.round(line.x_studio_ancho_m * 1000);
    const h = Math.round(line.x_studio_alto_m * 1000);
    if (w > 0 && h > 0) dim = `${w} x ${h}`;
  }
  const configParts = parts.filter((p: string) => !p.startsWith('[') && !p.toLowerCase().includes('cantidad:') && !p.toLowerCase().startsWith('termopanel') && !p.toLowerCase().startsWith('cristal monolítico'));
  if (configParts.length > 0) config = configParts.join(' | ');
  return { ref, cant, dim, config };
}

function ReportsDashboardContent() {
  const [filtro, setFiltro] = useState<'diario' | 'mes' | 'historico' | 'fecha_especifica'>('mes');
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState<number | null>(null);
  const [clientes, setClientes] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [userName, setUserName] = useState('cristian3877');
  // Estado para saber qué pedido está generando PDF (presupuesto o taller)
  const [pdfLoading, setPdfLoading] = useState<{ id: number; tipo: 'presupuesto' | 'taller' } | null>(null);

  // Cargar nombre del usuario desde la cookie
  useEffect(() => {
    const cookieVal = document.cookie
      .split('; ')
      .find((r) => r.startsWith('odoo_user='))
      ?.split('=')
      .slice(1)
      .join('=');
    if (cookieVal) {
      try {
        const parsed = JSON.parse(decodeURIComponent(cookieVal));
        const name = parsed.name || parsed.email?.split('@')[0] || 'cristian3877';
        // Limpiar para que coincida con el estilo si es un email completo
        setUserName(name.includes('@') ? name.split('@')[0] : name);
      } catch {}
    }
  }, []);

  // Cargar datos de Odoo
  const fetchReportData = async (filterVal: 'diario' | 'mes' | 'historico' | 'fecha_especifica', clientVal: number | null, fecha?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await obtenerDatosReportes(filterVal, clientVal || undefined, fecha);
      if (res.exito && res.data) {
        setStats(res.data);
        if (res.clientesDisponibles) {
          setClientes(res.clientesDisponibles);
        }
      } else {
        setError(res.error || 'Ocurrió un error al cargar los reportes.');
      }
    } catch (err: any) {
      console.error(err);
      setError('Error al comunicar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (filtro === 'fecha_especifica' && !fechaSeleccionada) return;
    fetchReportData(filtro, clienteSeleccionado, fechaSeleccionada);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, clienteSeleccionado, fechaSeleccionada]);

  const handleRefresh = () => {
    fetchReportData(filtro, clienteSeleccionado, fechaSeleccionada);
  };

  const handlePrint = () => {
    window.print();
  };

  // ─── Generadores de PDF reutilizados de /cotizaciones ────────────────────────

  const handlePdfPresupuesto = async (pedidoId: number, pedidoName: string) => {
    setPdfLoading({ id: pedidoId, tipo: 'presupuesto' });
    try {
      const res = await obtenerDetalleCotizacion(pedidoId);
      if (!res.exito || !res.order) { alert('No se pudo cargar el detalle de la venta.'); return; }
      const detail = res.order;
      const doc = new jsPDF();
      try {
        const logoRes = await fetch('/logo.png');
        const blob = await logoRes.blob();
        const logoBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        doc.addImage(logoBase64, 'PNG', 14, 10, 45, 22);
      } catch { /* sin logo */ }

      doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
      doc.text('Presupuesto Termopaneles', 105, 20, { align: 'center' });
      doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
      doc.text(`N° ${detail.name}`, 105, 28, { align: 'center' });
      doc.setFontSize(9); doc.setTextColor(100, 100, 100);
      doc.text(`Fecha: ${formatDatePdf(detail.date_order)}`, 196, 18, { align: 'right' });
      doc.text(`Cliente: ${detail.partner_id?.[1] ?? '—'}`, 196, 25, { align: 'right' });
      doc.setTextColor(0, 0, 0);

      let currentY = 46;
      const productLines = detail.order_line.filter((l: any) => l.display_type !== 'line_note' && l.display_type !== 'line_section');
      const totalM2 = productLines.reduce((acc: number, l: any) => acc + l.product_uom_qty, 0);
      doc.text(`Total Metros Cuadrados: ${totalM2.toFixed(2)} m²`, 14, currentY);

      let yPos = currentY + 14;
      doc.setFillColor(240, 240, 240); doc.rect(14, yPos - 5, 182, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.text('Ref', 16, yPos); doc.text('Cant.', 43, yPos); doc.text('Dim. (mm)', 57, yPos);
      doc.text('Configuración', 84, yPos); doc.text('Unitario', 152, yPos); doc.text('Total', 176, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += 10;

      productLines.forEach((line: any, index: number) => {
        const parsed = parseOdooLinePdf(line, index);
        const splitLabel = doc.splitTextToSize(parsed.ref, 25);
        const splitConfig = doc.splitTextToSize(parsed.config, 66);
        const lineCount = Math.max(splitLabel.length, splitConfig.length);
        if (yPos + (lineCount * 5) > 275) { doc.addPage(); yPos = 20; }
        doc.text(splitLabel, 16, yPos); doc.text(parsed.cant, 43, yPos);
        doc.text(parsed.dim, 57, yPos); doc.text(splitConfig, 84, yPos);
        const displayedCant = parseFloat(parsed.cant) || 1;
        const unitario = Math.round(line.price_subtotal / displayedCant);
        doc.text(`$${unitario.toLocaleString('es-CL')}`, 152, yPos);
        doc.text(`$${line.price_subtotal.toLocaleString('es-CL')}`, 176, yPos);
        yPos += (lineCount * 5) + 5;
      });

      doc.line(14, yPos, 196, yPos); yPos += 10;
      const net = detail.amount_untaxed; const tax = detail.amount_tax; const total = detail.amount_total;
      doc.setFont('helvetica', 'bold');
      doc.text(`Total Neto: $${net.toLocaleString('es-CL')}`, 140, yPos); yPos += 6;
      doc.text(`IVA (19%): $${tax.toLocaleString('es-CL')}`, 140, yPos); yPos += 6;
      doc.setFontSize(11); doc.text(`Total: $${total.toLocaleString('es-CL')}`, 140, yPos);

      if (yPos > 200) { doc.addPage(); yPos = 20; }
      yPos += 15;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text('NOTAS:', 14, yPos);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
      const notas = [
        'Este presupuesto tiene una validez de 10 días.',
        'Plazo de entrega a contar de 48 horas para Termopaneles, una vez recibida Orden de Compra.',
        'Esperando este Presupuesto sea de su agrado le saluda atentamente:',
      ];
      if (detail.note) { const n = stripHtml(detail.note); if (n) notas.unshift(`Observaciones: ${n}`); }
      notas.forEach(nota => {
        yPos += 5.5;
        const splitNota = doc.splitTextToSize(nota, 182);
        doc.text(splitNota, 14, yPos);
        yPos += (splitNota.length - 1) * 4.5;
      });
      yPos += 20;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
      doc.text('Firma de aceptación del Cliente: ___________________________', 14, yPos);
      doc.text('Modalidad de Pago: __________________', 120, yPos);

      const sanitized = detail.partner_id?.[1]?.trim().replace(/[^a-zA-Z0-9_-]/g, '_') ?? 'Sin_Cliente';
      doc.save(`Presupuesto_${detail.name}_${sanitized}.pdf`);
    } catch (e: any) {
      alert(`Error al generar PDF: ${e.message}`);
    } finally {
      setPdfLoading(null);
    }
  };

  const handlePdfTaller = async (pedidoId: number, pedidoName: string) => {
    setPdfLoading({ id: pedidoId, tipo: 'taller' });
    try {
      const res = await obtenerDetalleCotizacion(pedidoId);
      if (!res.exito || !res.order) { alert('No se pudo cargar el detalle de la venta.'); return; }
      const detail = res.order;
      const doc = new jsPDF();

      const productLines = detail.order_line.filter((l: any) => l.display_type !== 'line_note' && l.display_type !== 'line_section');
      if (productLines.length === 0) { alert('No hay productos válidos para generar órdenes de trabajo.'); return; }

      const parsedItems = productLines.map((line: any, index: number) => {
        const name = line.name || '';
        const rawSplit = name.includes(' | ') ? name.split(' | ').map((p: string) => p.trim()) : name.split(/\n/).map((p: string) => p.trim());
        const parts: string[] = [];
        for (const rp of rawSplit) {
          const bracketEnd = rp.indexOf(']');
          if (rp.startsWith('[') && bracketEnd !== -1 && bracketEnd < rp.length - 1) {
            parts.push(rp.slice(0, bracketEnd + 1).trim());
            const rest = rp.slice(bracketEnd + 1).trim();
            if (rest) parts.push(rest);
          } else { parts.push(rp); }
        }
        let cantidad = 1;
        const cantPart = parts.find(p => p.toLowerCase().includes('cantidad:'));
        if (cantPart) { const m = cantPart.match(/cantidad:\s*(\d+)/i); if (m) cantidad = parseInt(m[1], 10) || 1; }

        let ancho = 0, alto = 0;
        const dimPart = parts.find(p => /termopanel\s+\d/i.test(p) || /^dimensiones?:/i.test(p) || /cristal monol/i.test(p));
        if (dimPart) { const m = dimPart.match(/(\d+)\s*x\s*(\d+)/i); if (m) { ancho = parseInt(m[1], 10); alto = parseInt(m[2], 10); } }
        else if (line.x_studio_ancho_m != null) { ancho = Math.round(line.x_studio_ancho_m * 1000); alto = Math.round((line.x_studio_alto_m * 1000) / cantidad); }

        const c1Part = parts.find(p => /^(cristal 1|c1|cristal):/i.test(p));
        let cristal1_tipo = 'Incoloro', cristal1_espesor = 6;
        if (c1Part) { const m = c1Part.match(/^(?:cristal 1|c1|cristal):\s*(.+?)\s+(\d+)\s*mm/i); if (m) { cristal1_tipo = m[1].trim(); cristal1_espesor = parseInt(m[2], 10) || 6; } }

        const c2Part = parts.find(p => /^(cristal 2|c2):/i.test(p));
        let cristal2_tipo = '', cristal2_espesor = 0, hasCristal2 = false;
        if (c2Part) {
          hasCristal2 = true;
          const m = c2Part.match(/^(?:cristal 2|c2):\s*(.+?)\s+(\d+)\s*mm/i);
          if (m) { cristal2_tipo = m[1].trim(); cristal2_espesor = parseInt(m[2], 10) || 6; }
        }

        const sepPart = parts.find(p => /^(separador|sep)(?:-|:)/i.test(p));
        let sep_espesor = 0, sep_color = '', hasSeparador = false;
        if (sepPart) {
          hasSeparador = true;
          const m1 = sepPart.match(/separador(?:-|:)\s*(\d+)\s*mm\s+color\s+(.+)/i);
          if (m1) { sep_espesor = parseInt(m1[1]); sep_color = m1[2].trim(); }
          else { const m2 = sepPart.match(/(?:separador|sep)[:\-]\s*(\d+)\s*mm?(?:\s+(?:color\s+)?|\s*-\s*)(.+)?/i); if (m2) { sep_espesor = parseInt(m2[1]) || 12; sep_color = (m2[2] || 'Negro').trim(); } }
        }

        let label = `V${index + 1}`;
        const refMatch = parts[0]?.match(/^\[([^\]]+)\]/);
        if (refMatch) label = refMatch[1];

        const extrasPart = parts.find(p => p.toLowerCase().startsWith('extras:'));
        let extrasText = '';
        if (extrasPart) { extrasText = extrasPart.trim(); }
        else {
          const others = parts.filter(p => !p.startsWith('[') && !p.toLowerCase().includes('cantidad:') && !p.toLowerCase().includes('termopanel') && !p.toLowerCase().includes('monolítico') && !p.toLowerCase().includes('monolitico') && !p.toLowerCase().startsWith('cristal 1') && !p.toLowerCase().startsWith('c1:') && !p.toLowerCase().startsWith('cristal 2') && !p.toLowerCase().startsWith('c2:') && !p.toLowerCase().startsWith('separador') && !p.toLowerCase().startsWith('sep:') && !p.toLowerCase().startsWith('cristal:'));
          if (others.length > 0) extrasText = `Extras: ${others.join(', ')}`;
        }

        const isTermopanel = name.toLowerCase().includes('termopanel') || hasCristal2 || hasSeparador || sep_espesor > 0;
        return { label, cantidad, ancho, alto, cristal1: { tipo: cristal1_tipo, espesor: cristal1_espesor }, cristal2: hasCristal2 ? { tipo: cristal2_tipo, espesor: cristal2_espesor } : null, separador: hasSeparador ? { espesor: sep_espesor, color: sep_color } : null, extrasText, isTermopanel };
      });

      const hasTermopaneles = parsedItems.some((i: any) => i.isTermopanel);
      const totalM2 = parsedItems.reduce((acc: number, i: any) => acc + ((i.ancho * i.alto) / 1000000) * i.cantidad, 0);
      const clientName = detail.partner_id?.[1] ?? 'Sin Cliente';

      let logoBase64: string | null = null;
      try {
        const logoRes = await fetch('/logo.png');
        const blob = await logoRes.blob();
        logoBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(blob); });
      } catch { /* sin logo */ }

      // Página 1: Taller Corte Vidrio
      if (logoBase64) doc.addImage(logoBase64, 'PNG', 14, 10, 36, 18);
      doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
      doc.text('ORDEN DE TRABAJO', 105, 20, { align: 'center' });
      doc.setFontSize(13); doc.setTextColor(80, 80, 80);
      doc.text('Taller Corte Vidrio', 105, 28, { align: 'center' });
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
      doc.text(`Ref: ${detail.name}`, 196, 13, { align: 'right' });
      doc.text(`Fecha: ${new Date().toLocaleDateString('es-CL')}`, 196, 20, { align: 'right' });
      doc.text(`Cliente: ${clientName}`, 196, 27, { align: 'right' });
      doc.setTextColor(0, 0, 0);
      doc.setDrawColor(200, 200, 200); doc.line(14, 38, 196, 38);

      let yPos = 48;
      doc.setFillColor(51, 65, 85); doc.rect(14, yPos - 6, 182, 9, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text('Ref', 17, yPos); doc.text('Ancho (mm)', 36, yPos); doc.text('Alto (mm)', 58, yPos);
      doc.text('Cant.', 77, yPos); doc.text('Cristal 1', 89, yPos); doc.text('Cant.', 138, yPos); doc.text('Cristal 2', 150, yPos);
      doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
      yPos += 8;

      parsedItems.forEach((item: any, index: number) => {
        const splitLabel = doc.splitTextToSize(item.label, 28);
        const rowHeight = item.extrasText ? 14 : Math.max(8, (splitLabel.length * 4) + 4);
        if (yPos + rowHeight > 275) { doc.addPage(); yPos = 20; }
        if (index % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(14, yPos - 5, 182, rowHeight, 'F'); }
        doc.setFontSize(9);
        doc.text(splitLabel, 17, yPos);
        doc.setFont('helvetica', 'bold'); doc.text(`${item.ancho}`, 36, yPos); doc.text(`${item.alto}`, 58, yPos); doc.setFont('helvetica', 'normal');
        doc.text(`${item.cantidad}`, 79, yPos);
        doc.text(`${item.cristal1.tipo} ${item.cristal1.espesor}mm`, 89, yPos);
        if (item.cristal2) { doc.text(`${item.cantidad}`, 140, yPos); doc.text(`${item.cristal2.tipo} ${item.cristal2.espesor}mm`, 150, yPos); }
        else { doc.text('—', 140, yPos); doc.text('—', 150, yPos); }
        if (item.extrasText) { doc.setFontSize(8); doc.setTextColor(100, 100, 100); doc.text(item.extrasText, 110, yPos + 4.5); doc.setTextColor(0, 0, 0); }
        yPos += rowHeight;
      });
      doc.setDrawColor(200, 200, 200); doc.line(14, yPos, 196, yPos);
      yPos += 8;
      doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text(`Total a cortar: ${totalM2.toFixed(2)} m²`, 14, yPos);

      // Página 2: Taller Termopaneles
      if (hasTermopaneles) {
        doc.addPage();
        if (logoBase64) doc.addImage(logoBase64, 'PNG', 14, 10, 36, 18);
        doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
        doc.text('ORDEN DE TRABAJO', 105, 20, { align: 'center' });
        doc.setFontSize(13); doc.setTextColor(80, 80, 80);
        doc.text('Taller Termopaneles', 105, 28, { align: 'center' });
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
        doc.text(`Ref: ${detail.name}`, 196, 13, { align: 'right' });
        doc.text(`Fecha: ${new Date().toLocaleDateString('es-CL')}`, 196, 20, { align: 'right' });
        doc.text(`Cliente: ${clientName}`, 196, 27, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        doc.setDrawColor(200, 200, 200); doc.line(14, 38, 196, 38);
        yPos = 48;
        doc.setFillColor(15, 118, 110); doc.rect(14, yPos - 6, 182, 9, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('Ref', 17, yPos); doc.text('Cant.', 47, yPos); doc.text('Ancho', 58, yPos); doc.text('Alto', 73, yPos);
        doc.text('Cristal 1', 88, yPos); doc.text('Cristal 2', 121, yPos); doc.text('Sep. (mm)', 154, yPos); doc.text('Color Sep.', 175, yPos);
        doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
        yPos += 8;
        const termoItems = parsedItems.filter((i: any) => i.isTermopanel);
        termoItems.forEach((item: any, index: number) => {
          const splitLabel = doc.splitTextToSize(item.label, 28);
          const rowHeight = item.extrasText ? 14 : Math.max(8, (splitLabel.length * 4) + 4);
          if (yPos + rowHeight > 275) { doc.addPage(); yPos = 20; }
          if (index % 2 === 0) { doc.setFillColor(240, 253, 250); doc.rect(14, yPos - 5, 182, rowHeight, 'F'); }
          doc.setFontSize(9);
          doc.text(splitLabel, 17, yPos); doc.text(`${item.cantidad}`, 47, yPos);
          doc.setFont('helvetica', 'bold'); doc.text(`${item.ancho}`, 58, yPos); doc.text(`${item.alto}`, 73, yPos); doc.setFont('helvetica', 'normal');
          doc.text(`${item.cristal1.tipo} ${item.cristal1.espesor}mm`, 88, yPos);
          if (item.cristal2) { doc.text(`${item.cristal2.tipo} ${item.cristal2.espesor}mm`, 121, yPos); } else { doc.text('—', 121, yPos); }
          if (item.separador) { doc.setFont('helvetica', 'bold'); doc.text(`${item.separador.espesor}`, 154, yPos); doc.text(`${item.separador.color}`, 175, yPos); doc.setFont('helvetica', 'normal'); }
          else { doc.text('—', 154, yPos); doc.text('—', 175, yPos); }
          if (item.extrasText) { doc.setFontSize(8); doc.setTextColor(100, 100, 100); doc.text(item.extrasText, 88, yPos + 4.5); doc.setTextColor(0, 0, 0); }
          yPos += rowHeight;
        });
        doc.setDrawColor(200, 200, 200); doc.line(14, yPos, 196, yPos);
        yPos += 8; doc.setFontSize(10); doc.setFont('helvetica', 'bold');
        const termoM2 = termoItems.reduce((acc: number, i: any) => acc + ((i.ancho * i.alto) / 1000000) * i.cantidad, 0);
        doc.text(`Total a armar: ${termoM2.toFixed(2)} m²`, 14, yPos);
      }

      const sanitized = clientName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      doc.save(`Ordenes_Trabajo_${detail.name}_${sanitized}.pdf`);
    } catch (e: any) {
      alert(`Error al generar PDF: ${e.message}`);
    } finally {
      setPdfLoading(null);
    }
  };

  return (
    <div className="p-6 pb-12 bg-slate-50 min-h-screen font-sans">
      {/* Botón de retroceso */}
      <div className="max-w-7xl mx-auto mb-6 print:hidden">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700 font-medium text-sm transition-colors"
        >
          <ArrowLeft size={16} />
          Volver al Cotizador
        </a>
      </div>

      {/* Cabecera del Reporte */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">
            {filtro === 'fecha_especifica' && fechaSeleccionada ? `Reporte del ${new Date(fechaSeleccionada + 'T00:00:00').toLocaleDateString('es-CL')}` : `Bienvenido, ${userName}`}
          </h1>
          <p className="text-slate-500 text-sm mt-1 print:hidden">
            Aquí tienes un resumen de la actividad del negocio.
          </p>
        </div>

        {/* Controles de Filtro */}
        <div className="flex flex-col sm:flex-row items-center gap-3 self-stretch md:self-auto w-full md:w-auto print:hidden">
          {/* Filtro por Cliente */}
          <div className="relative w-full sm:w-64">
            <select
              value={clienteSeleccionado || ''}
              onChange={(e) => {
                const val = e.target.value;
                setClienteSeleccionado(val ? parseInt(val, 10) : null);
              }}
              className="w-full appearance-none bg-white border border-slate-200 px-4 py-2.5 pr-10 rounded-xl text-slate-700 font-semibold shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all cursor-pointer text-sm truncate"
            >
              <option value="">Todos los Clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
              <Users size={16} />
            </div>
          </div>

          {/* Filtro por Período */}
          <div className="relative w-full sm:w-44">
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as 'diario' | 'mes' | 'historico' | 'fecha_especifica')}
              className="w-full appearance-none bg-white border border-slate-200 px-4 py-2.5 pr-10 rounded-xl text-slate-700 font-semibold shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all cursor-pointer text-sm"
            >
              <option value="diario">Diario (Hoy)</option>
              <option value="mes">Este Mes</option>
              <option value="historico">Histórico</option>
              <option value="fecha_especifica">Fecha Específica</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
          </div>

          {/* Selector de Fecha (solo visible si filtro es fecha_especifica) */}
          {filtro === 'fecha_especifica' && (
            <div className="relative w-full sm:w-44">
              <input
                type="date"
                value={fechaSeleccionada}
                onChange={(e) => setFechaSeleccionada(e.target.value)}
                className="w-full appearance-none bg-white border border-slate-200 px-4 py-2.5 pr-10 rounded-xl text-slate-700 font-semibold shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all cursor-pointer text-sm"
              />
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                <Calendar size={16} />
              </div>
            </div>
          )}

          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all duration-200 transform active:scale-95 whitespace-nowrap w-full sm:w-auto"
            title="Imprimir reporte"
          >
            <Printer size={16} />
            Imprimir
          </button>

          <button
            onClick={handleRefresh}
            className="flex items-center justify-center gap-2 bg-[#14b8a6] hover:bg-[#0d9488] text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all duration-200 transform active:scale-95 whitespace-nowrap w-full sm:w-auto"
            title="Refrescar reporte"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Nuevo Reporte
          </button>
        </div>
      </header>

      {/* Pantalla de Carga */}
      {loading && (
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-teal-600 animate-spin mb-4" />
          <p className="text-slate-500 font-medium text-sm">Cargando estadísticas del ERP Odoo...</p>
        </div>
      )}

      {/* Pantalla de Error */}
      {error && !loading && (
        <div className="max-w-7xl mx-auto bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl shadow-sm mb-8">
          <p className="font-bold text-lg">Error de carga</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={handleRefresh}
            className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium text-xs transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Contenido de Reportes */}
      {!loading && !error && stats && (
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Fila de 4 Tarjetas de KPIs */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Tarjeta 1: INGRESOS TOTALES */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="p-3.5 bg-emerald-500 text-white rounded-2xl shadow-sm">
                  <DollarSign size={24} />
                </div>
                <span className="bg-emerald-50 text-emerald-600 text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  +12%
                </span>
              </div>
              <div className="mt-4">
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Ingresos Totales</p>
                <p className="text-3xl font-black text-slate-800 mt-1 font-mono">
                  ${stats.ingresosTotales.toLocaleString('es-CL')}
                </p>
              </div>
            </div>

            {/* Tarjeta 2: PRESUPUESTOS EMITIDOS */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="p-3.5 bg-blue-500 text-white rounded-2xl shadow-sm">
                  <ClipboardList size={24} />
                </div>
                <span className="bg-emerald-50 text-emerald-600 text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  +5%
                </span>
              </div>
              <div className="mt-4">
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Ventas Confirmadas</p>
                <p className="text-3xl font-black text-slate-800 mt-1 font-mono">
                  {stats.presupuestosEmitidos}
                </p>
              </div>
            </div>

            {/* Tarjeta 3: TICKET PROMEDIO */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="p-3.5 bg-orange-500 text-white rounded-2xl shadow-sm">
                  <TrendingUp size={24} />
                </div>
                <span className="bg-rose-50 text-rose-600 text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  -2%
                </span>
              </div>
              <div className="mt-4">
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Ticket Promedio</p>
                <p className="text-3xl font-black text-slate-800 mt-1 font-mono">
                  ${stats.ticketPromedio.toLocaleString('es-CL')}
                </p>
              </div>
            </div>

            {/* Tarjeta 4: ESTE MES */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="p-3.5 bg-purple-500 text-white rounded-2xl shadow-sm">
                  <Box size={24} />
                </div>
                <span className="bg-emerald-50 text-emerald-600 text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  +18%
                </span>
              </div>
              <div className="mt-4">
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Este Mes (Ventas)</p>
                <p className="text-3xl font-black text-slate-800 mt-1 font-mono">
                  {stats.esteMesCount}
                </p>
              </div>
            </div>
          </section>

          {/* Sección de Producción por Talleres y Mano de Obra */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Producción por Taller (m2) */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 lg:col-span-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Wrench className="text-teal-600" size={18} />
                  <h2 className="text-lg font-bold text-slate-800">Volumen de Producción por Taller</h2>
                </div>
                <p className="text-xs text-slate-400">Metros cuadrados totales realizados/maquilados en cada taller.</p>
              </div>

              <div className="mt-8 space-y-6">
                {/* Taller Corte Vidrio */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-slate-700">Taller Corte Vidrio</span>
                    <span className="text-sm font-bold text-teal-600 font-mono">{stats.tallerCorteM2.toFixed(2)} m²</span>
                  </div>
                  <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                    <div
                      className="bg-teal-500 h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${
                          stats.tallerCorteM2 + stats.tallerTermoM2 > 0
                            ? (stats.tallerCorteM2 / Math.max(stats.tallerCorteM2, stats.tallerTermoM2)) * 100
                            : 0
                        }%`
                      }}
                    />
                  </div>
                </div>

                {/* Taller Termopaneles */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-slate-700">Taller Termopaneles</span>
                    <span className="text-sm font-bold text-indigo-600 font-mono">{stats.tallerTermoM2.toFixed(2)} m²</span>
                  </div>
                  <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${
                          stats.tallerCorteM2 + stats.tallerTermoM2 > 0
                            ? (stats.tallerTermoM2 / Math.max(stats.tallerCorteM2, stats.tallerTermoM2)) * 100
                            : 0
                        }%`
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between text-xs text-slate-500">
                <span>* Calculado a partir de órdenes de venta confirmadas</span>
                <span>ProWindows Ltda.</span>
              </div>
            </div>

            {/* Total Mano de Obra */}
            <div className="bg-gradient-to-br from-teal-500 to-emerald-600 p-6 rounded-2xl shadow-sm text-white flex flex-col justify-between relative overflow-hidden">
              <div className="absolute right-0 bottom-0 opacity-10 translate-x-4 translate-y-4">
                <Wrench size={180} />
              </div>
              <div>
                <p className="text-xs text-teal-100 font-semibold uppercase tracking-wider">Costo Laboral</p>
                <h2 className="text-2xl font-bold mt-1">Total en Mano de Obra</h2>
                <p className="text-teal-50 text-xs mt-2 leading-relaxed">
                  Basado en la tasa de mano de obra de <strong>${stats.costoManoDeObra.toLocaleString()} CLP</strong> por m² de termopaneles ensamblados en el sistema.
                </p>
              </div>
              <div className="mt-8">
                <span className="text-xs text-teal-100 block">Mano de Obra Acumulada</span>
                <span className="text-4xl font-black font-mono block mt-1">
                  ${Math.round(stats.totalManoDeObra).toLocaleString('es-CL')}
                </span>
              </div>
            </div>
          </section>

          {/* Sección de Insumos y Materiales */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-6">
              <Grid className="text-teal-600" size={18} />
              <h2 className="text-lg font-bold text-slate-800">Insumos y Componentes Utilizados</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {/* Tarjeta Insumo 1: Cristales */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Vidrio en Corte</span>
                  <span className="text-xl font-bold text-slate-700 mt-1 block">Cristales Totales</span>
                </div>
                <div className="mt-4 text-right">
                  <span className="text-2xl font-black text-teal-600 font-mono">{stats.insumos.cristalTotalM2.toFixed(2)} m²</span>
                </div>
              </div>

              {/* Tarjeta Insumo 2: Hotmelt */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Sellante de Borde</span>
                  <span className="text-xl font-bold text-slate-700 mt-1 block">Hotmelt</span>
                </div>
                <div className="mt-4 text-right">
                  <span className="text-2xl font-black text-teal-600 font-mono">{stats.insumos.hotmelt.toFixed(2)} ml</span>
                </div>
              </div>

              {/* Tarjeta Insumo 3: Butilo */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Sello Primario</span>
                  <span className="text-xl font-bold text-slate-700 mt-1 block">Butilo</span>
                </div>
                <div className="mt-4 text-right">
                  <span className="text-2xl font-black text-teal-600 font-mono">{stats.insumos.butilo.toFixed(2)} ml</span>
                </div>
              </div>

              {/* Tarjeta Insumo 4: Escuadras */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Conectores de Esquina</span>
                  <span className="text-xl font-bold text-slate-700 mt-1 block">Escuadras</span>
                </div>
                <div className="mt-4 text-right">
                  <span className="text-2xl font-black text-teal-600 font-mono">{stats.insumos.escuadras} uds</span>
                </div>
              </div>
            </div>

            {/* Desgloses Detallados de Cristales y Separadores */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4 border-t border-slate-100">
              {/* Desglose de Cristales por Tipo */}
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
                  Consumo por Tipo de Cristal (m²)
                </h3>
                <div className="space-y-3">
                  {Object.keys(stats.insumos.cristalesTipo).length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Sin registros en el período.</p>
                  ) : (
                    Object.entries(stats.insumos.cristalesTipo).map(([tipo, data]) => {
                      const desperdicio = data.real > 0 ? ((data.real - data.neto) / data.real) * 100 : 0;
                      const planchas = Math.round(data.real / 4.5); // planchas de 1800 x 2500 mm (4.5 m2 cada una)
                      return (
                        <div key={tipo} className="p-3 bg-slate-50 rounded-xl hover:bg-slate-100/70 transition-colors space-y-1.5 border border-slate-100">
                          <div className="flex justify-between items-start text-xs font-semibold text-slate-700">
                            <span className="max-w-[70%] truncate" title={tipo}>{tipo}</span>
                            <span className="font-bold font-mono text-teal-600 text-right whitespace-nowrap">
                              {data.real.toFixed(2)} m² ({planchas} planchas)
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
                            <span>Neto: {data.neto.toFixed(2)} m²</span>
                            <span>Desperdicio: <strong className="text-amber-600 font-mono">{desperdicio.toFixed(1)}%</strong></span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Desglose de Separadores por Color */}
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                  Separadores por Color y Espesor (ml)
                </h3>
                <div className="space-y-3">
                  {Object.keys(stats.insumos.separadoresColor).length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Sin registros en el período.</p>
                  ) : (
                    Object.entries(stats.insumos.separadoresColor).map(([color, sepData]) => {
                      const desperdicio = sepData.real > 0 ? ((sepData.real - sepData.neto) / sepData.real) * 100 : 0;
                      const tiras = Math.round(sepData.real / 5);
                      return (
                        <div key={color} className="p-3 bg-slate-50 rounded-xl hover:bg-slate-100/70 transition-colors space-y-1.5 border border-slate-100">
                          <div className="flex justify-between items-start text-xs font-semibold text-slate-700">
                            <span className="max-w-[70%] truncate" title={color}>{color}</span>
                            <span className="font-bold font-mono text-indigo-600 text-right whitespace-nowrap">
                              {sepData.real.toFixed(1)} ml ({tiras} tiras)
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
                            <span>Neto: {sepData.neto.toFixed(1)} ml</span>
                            <span>Desperdicio: <strong className="text-amber-600 font-mono">{desperdicio.toFixed(1)}%</strong></span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Desglose de Palillaje por Color */}
            {Object.keys(stats.insumos.palillajeColor).length > 0 && (
              <div className="pt-6 border-t border-slate-100">
                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                  Palillaje por Color
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(stats.insumos.palillajeColor).map(([color, palData]) => {
                    // Generar color visual de badge según el nombre del color
                    const colorLower = color.toLowerCase();
                    const badgeStyle: React.CSSProperties = {};
                    if (colorLower.includes('blanco')) { badgeStyle.backgroundColor = '#f1f5f9'; badgeStyle.color = '#475569'; badgeStyle.border = '1px solid #cbd5e1'; }
                    else if (colorLower.includes('negro') || colorLower.includes('black')) { badgeStyle.backgroundColor = '#1e293b'; badgeStyle.color = '#f8fafc'; }
                    else if (colorLower.includes('bronce') || colorLower.includes('bronze')) { badgeStyle.backgroundColor = '#92400e'; badgeStyle.color = '#fef3c7'; }
                    else if (colorLower.includes('gris') || colorLower.includes('grey') || colorLower.includes('gray')) { badgeStyle.backgroundColor = '#64748b'; badgeStyle.color = '#f8fafc'; }
                    else if (colorLower.includes('cafe') || colorLower.includes('madera') || colorLower.includes('marr')) { badgeStyle.backgroundColor = '#78350f'; badgeStyle.color = '#fef3c7'; }
                    else if (colorLower.includes('dorado') || colorLower.includes('gold')) { badgeStyle.backgroundColor = '#b45309'; badgeStyle.color = '#fefce8'; }
                    else { badgeStyle.backgroundColor = '#e0e7ff'; badgeStyle.color = '#4338ca'; }

                    return (
                      <div
                        key={color}
                        className="p-4 bg-slate-50 rounded-xl border border-slate-100 hover:bg-amber-50/50 hover:border-amber-100 transition-colors flex flex-col gap-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="text-[11px] font-bold px-2.5 py-1 rounded-full truncate max-w-[70%]"
                            style={badgeStyle}
                            title={color}
                          >
                            {color}
                          </span>
                          <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
                            {palData.cantidad} panel{palData.cantidad !== 1 ? 'es' : ''}
                          </span>
                        </div>
                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Tiras consumidas</p>
                            <p className="text-2xl font-black text-amber-600 font-mono leading-tight mt-0.5">
                              {palData.tiras}
                            </p>
                          </div>
                          <span className="text-[10px] text-slate-400 italic text-right">
                            {palData.tiras === 1 ? '1 tira' : `${palData.tiras} tiras`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Estadísticas de Clientes (Ranking) */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-6">
              <Users className="text-teal-600" size={18} />
              <h2 className="text-lg font-bold text-slate-800">Estadísticas de Clientes Destacados</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="pb-3 w-12 text-center">Posición</th>
                    <th className="pb-3">Nombre del Cliente</th>
                    <th className="pb-3 text-center w-28">N° de Ventas</th>
                    <th className="pb-3 text-right w-40">Monto Comprado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.clientesRanking.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-slate-400 italic">
                        No se registraron ventas confirmadas en este período.
                      </td>
                    </tr>
                  ) : (
                    stats.clientesRanking.map((cliente, idx) => (
                      <tr key={cliente.name} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 text-center font-bold text-slate-400">
                          {idx + 1 === 1 ? '🥇' : idx + 1 === 2 ? '🥈' : idx + 1 === 3 ? '🥉' : idx + 1}
                        </td>
                        <td className="py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center font-semibold text-xs">
                              {cliente.name.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="font-semibold text-slate-700">{cliente.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 text-center font-mono font-medium text-slate-600">
                          {cliente.pedidos}
                        </td>
                        <td className="py-3.5 text-right font-bold text-slate-800 font-mono">
                          ${cliente.total.toLocaleString('es-CL')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Detalle de Ventas Confirmadas */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-6">
              <ClipboardList className="text-teal-600" size={18} />
              <h2 className="text-lg font-bold text-slate-800">Detalle de Ventas Confirmadas</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="pb-3">N° Venta</th>
                    <th className="pb-3">Cliente</th>
                    <th className="pb-3 text-center w-32">Fecha</th>
                    <th className="pb-3 text-center w-28">Estado</th>
                    <th className="pb-3 text-right w-40">Total</th>
                    <th className="pb-3 text-center w-48 print:hidden">PDFs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.pedidosDetalle.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-xs text-slate-400 italic">
                        No se encontraron registros en este período.
                      </td>
                    </tr>
                  ) : (
                    stats.pedidosDetalle.map((pedido) => (
                      <tr key={pedido.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 font-bold text-slate-800">
                          {pedido.name}
                        </td>
                        <td className="py-3.5">
                          <span className="font-semibold text-slate-700">{pedido.cliente}</span>
                        </td>
                        <td className="py-3.5 text-center text-slate-500 text-xs font-medium">
                          {pedido.fecha}
                        </td>
                        <td className="py-3.5 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            pedido.estado === 'Confirmado' || pedido.estado === 'Realizado'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              : pedido.estado === 'Cancelado'
                              ? 'bg-rose-50 text-rose-700 border border-rose-100'
                              : 'bg-amber-50 text-amber-700 border border-amber-100'
                          }`}>
                            {pedido.estado}
                          </span>
                        </td>
                        <td className="py-3.5 text-right font-bold text-slate-800 font-mono">
                          ${pedido.total.toLocaleString('es-CL')}
                        </td>
                        {/* Columna de botones PDF */}
                        <td className="py-3 text-center print:hidden">
                          <div className="flex items-center justify-center gap-2">
                            {/* Presupuesto PDF */}
                            <button
                              onClick={() => handlePdfPresupuesto(pedido.id, pedido.name)}
                              disabled={pdfLoading !== null}
                              title={`Descargar presupuesto ${pedido.name}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-100 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                            >
                              {pdfLoading?.id === pedido.id && pdfLoading.tipo === 'presupuesto' ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <FileText size={12} />
                              )}
                              Presupuesto
                            </button>
                            {/* Órdenes de Trabajo PDF */}
                            <button
                              onClick={() => handlePdfTaller(pedido.id, pedido.name)}
                              disabled={pdfLoading !== null}
                              title={`Descargar órdenes de trabajo ${pedido.name}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-100 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                            >
                              {pdfLoading?.id === pedido.id && pdfLoading.tipo === 'taller' ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <HardHat size={12} />
                              )}
                              Talleres
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default function ReportsDashboard() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
          <span className="text-slate-500 font-medium text-sm">Iniciando Dashboard...</span>
        </div>
      </div>
    }>
      <ReportsDashboardContent />
    </Suspense>
  );
}
