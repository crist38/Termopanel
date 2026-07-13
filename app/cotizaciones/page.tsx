"use client"

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";
import {
  listarCotizacionesOdoo,
  obtenerDetalleCotizacion,
  cancelarCotizacion,
  confirmarCotizacionOdoo,
} from "@/app/actions/odoo";
import { ClientSelector } from "@/components/ClientSelector";
import {
  Search,
  RefreshCw,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Edit3,
  Check,
  XCircle,
  FileText,
  AlertTriangle,
  Loader2,
  Save,
  Ban,
  ExternalLink,
  User,
  Calendar,
  DollarSign,
  Layers,
  Printer,
} from "lucide-react";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface SaleOrder {
  id: number;
  name: string;
  partner_id: [number, string];
  state: string;
  amount_total: number;
  amount_untaxed: number;
  amount_tax: number;
  date_order: string;
  user_id: [number, string] | false;
}

interface OrderLine {
  id: number;
  name: string;
  product_id: [number, string] | false;
  product_uom_qty: number;
  price_unit: number;
  price_subtotal: number;
  discount?: number;
  display_type: string | false;
  x_studio_ancho_m?: number;
  x_studio_alto_m?: number;
}

interface OrderDetail extends SaleOrder {
  note: string | false;
  order_line: OrderLine[];
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function stripHtml(htmlStr: string) {
  if (!htmlStr) return "";
  return htmlStr.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function parseOdooLine(line: OrderLine, index: number) {
  const name = line.name || "";
  
  let ref = `L${index + 1}`;
  let cant = line.product_uom_qty.toString(); 
  let dim = "—";
  let config = name;
  
  const parts = name.split(" | ").map(p => p.trim());
  
  const refMatch = parts[0]?.match(/^\[([^\]]+)\]$/);
  if (refMatch) {
    ref = refMatch[1];
  }
  
  const cantPart = parts.find(p => p.toLowerCase().includes("cantidad:"));
  if (cantPart) {
    const match = cantPart.match(/cantidad:\s*(\d+)/i);
    if (match) {
      cant = match[1];
    }
  }
  
  const dimPart = parts.find(p => p.toLowerCase().includes("termopanel") || p.toLowerCase().includes("cristal monolítico"));
  if (dimPart) {
    const match = dimPart.match(/(\d+)\s*x\s*(\d+)/i);
    if (match) {
      dim = `${match[1]} x ${match[2]}`;
    }
  } else if (line.x_studio_ancho_m != null && line.x_studio_alto_m != null) {
    const w = Math.round(line.x_studio_ancho_m * 1000);
    const h = Math.round(line.x_studio_alto_m * 1000);
    if (w > 0 && h > 0) {
      dim = `${w} x ${h}`;
    }
  }
  
  const configParts = parts.filter(p => 
    !p.startsWith("[") && 
    !p.toLowerCase().includes("cantidad:") && 
    !p.toLowerCase().startsWith("termopanel") &&
    !p.toLowerCase().startsWith("cristal monolítico")
  );
  
  if (configParts.length > 0) {
    config = configParts.join(" | ");
  }
  
  return { ref, cant, dim, config };
}

function parsePiezas(name: string): number {
  const parts = name.split(" | ").map(p => p.trim());
  const cantPart = parts.find(p => p.toLowerCase().includes("cantidad:"));
  if (cantPart) {
    const match = cantPart.match(/cantidad:\s*(\d+)/i);
    if (match) {
      const val = parseInt(match[1], 10);
      return val > 0 ? val : 1;
    }
  }
  return 1;
}

function parseDimensions(name: string): { ancho: number; alto: number } | null {
  const parts = name.split(" | ").map(p => p.trim());
  const dimPart = parts.find(p => p.toLowerCase().includes("termopanel") || p.toLowerCase().includes("cristal monolítico") || p.toLowerCase().includes("cristal"));
  if (dimPart) {
    const match = dimPart.match(/(\d+)\s*x\s*(\d+)/i);
    if (match) {
      return {
        ancho: parseInt(match[1], 10) || 0,
        alto: parseInt(match[2], 10) || 0
      };
    }
  }
  const match = name.match(/(\d+)\s*x\s*(\d+)/i);
  if (match) {
    return {
      ancho: parseInt(match[1], 10) || 0,
      alto: parseInt(match[2], 10) || 0
    };
  }
  return null;
}
// Opciones para los selectores de cristal y separador (extraidas de configService / vidrios)

const STATE_LABELS: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  draft: { label: "Borrador", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", dot: "bg-amber-400" },
  sent: { label: "Enviado", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", dot: "bg-blue-400" },
  sale: { label: "Confirmado", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-400" },
  done: { label: "Bloqueado", color: "text-slate-700", bg: "bg-slate-100 border-slate-200", dot: "bg-slate-400" },
  cancel: { label: "Cancelado", color: "text-red-700", bg: "bg-red-50 border-red-200", dot: "bg-red-400" },
};

function StateBadge({ state }: { state: string }) {
  const cfg = STATE_LABELS[state] ?? { label: state, color: "text-slate-600", bg: "bg-slate-100 border-slate-200", dot: "bg-slate-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function formatCLP(amount: number) {
  return `$${Math.round(amount).toLocaleString("es-CL")}`;
}

function formatDate(dateStr: string) {
  if (!dateStr) return "â€”";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const PAGE_SIZE = 15;

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function CotizacionesPage() {
  const router = useRouter();

  // Listado
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [sortBy, setSortBy] = useState("id desc");
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detalle
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Cancelar orden
  const [cancelling, setCancelling] = useState(false);

  // Confirmar orden y crear OTs
  const [confirming, setConfirming] = useState(false);

  // ─── Fetch list ────────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async (s: string, st: string, p: number, sort: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listarCotizacionesOdoo({ 
        search: s, 
        state: st, 
        limit: PAGE_SIZE, 
        offset: p * PAGE_SIZE,
        orderBy: sort
      });
      if (res.exito && res.orders) {
        setOrders(res.orders);
        setTotal(res.total ?? 0);
      } else {
        setError(res.error ?? "Error desconocido");
      }
    } catch (e: any) {
      setError(e.message ?? "Error de conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders(search, stateFilter, page, sortBy);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy]);

  // Debounce de búsqueda
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setPage(0);
      fetchOrders(val, stateFilter, 0, sortBy);
    }, 400);
  };

  const closeDetail = () => {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
  };

  const handleEditarCotizacion = () => {
    if (!detail) return;
    
    const productLines = detail.order_line.filter(
      (l: any) => !l.display_type && l.product_id && l.product_uom_qty > 0
    );
    const firstLineName = productLines[0]?.name || '';
    const isMonolitico = /monol[íi]tico/i.test(firstLineName);
    const isFormas = productLines.some((l: any) => /con forma/i.test(l.name || ''));

    let targetPath = '/';
    if (isMonolitico) {
      targetPath = '/monolitico';
    } else if (isFormas) {
      targetPath = '/formas';
    }

    router.push(`${targetPath}?editId=${detail.id}`);
  };

  const handleStateChange = (val: string) => {
    setStateFilter(val);
    setPage(0);
    fetchOrders(search, val, 0, sortBy);
  };

  const handleSortChange = (val: string) => {
    setSortBy(val);
    setPage(0);
  };

  const handleRefresh = () => {
    setPage(0);
    fetchOrders(search, stateFilter, 0, sortBy);
    setSelectedId(null);
    setDetail(null);
  };

  // ——— Fetch detail ——————————————————————————————————————————————————————————————————————————
  const openDetail = async (id: number) => {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await obtenerDetalleCotizacion(id);
      if (res.exito && res.order) {
        setDetail(res.order as OrderDetail);
      } else {
        setDetailError(res.error ?? "No se pudo cargar el detalle");
      }
    } catch (e: any) {
      setDetailError(e.message ?? "Error de conexión");
    } finally {
      setDetailLoading(false);
    }
  };

  // â”€â”€ Cancel order â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleCancel = async () => {
    if (!detail) return;
    if (!confirm(`¿Seguro que deseas cancelar la orden ${detail.name}? Esta acción no se puede deshacer fácilmente.`)) return;
    setCancelling(true);
    try {
      const res = await cancelarCotizacion(detail.id);
      if (res.exito) {
        // Refrescar lista y detalle
        fetchOrders(search, stateFilter, page, sortBy);
        openDetail(detail.id);
      } else {
        alert(`Error al cancelar: ${res.error}`);
      }
    } catch (e: any) {
      alert(`Error de conexión: ${e.message}`);
    } finally {
      setCancelling(false);
    }
  };

  // â”€â”€ Confirm order â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleConfirmar = async () => {
    if (!detail) return;
    if (!confirm(
      `¿Confirmar la orden ${detail.name}?\n\nEsto creará las órdenes de fabricación y de trabajo en los talleres correspondientes.`
    )) return;
    setConfirming(true);
    try {
      const res = await confirmarCotizacionOdoo(detail.id);
      if (res.exito) {
        // Refrescar lista y detalle
        fetchOrders(search, stateFilter, page, sortBy);
        openDetail(detail.id);
      } else {
        alert(`Error al confirmar: ${res.error}`);
      }
    } catch (e: any) {
      alert(`Error de conexión: ${e.message}`);
    } finally {
      setConfirming(false);
    }
  };

  const handlePrintPDF = async () => {
    if (!detail) return;
    const doc = new jsPDF();

    // Cargar logo de la empresa
    try {
      const res = await fetch('/logo.png');
      const blob = await res.blob();
      const logoBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      doc.addImage(logoBase64, 'PNG', 14, 10, 45, 22);
    } catch (e) {
      console.error("Error al cargar el logo en el PDF", e);
    }

    // Encabezado
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Presupuesto Termopaneles", 105, 20, { align: "center" });
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(`N° ${detail.name}`, 105, 28, { align: "center" });
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Fecha: ${formatDate(detail.date_order)}`, 196, 18, { align: "right" });
    doc.text(`Cliente: ${detail.partner_id?.[1] ?? "—"}`, 196, 25, { align: "right" });
    doc.setTextColor(0, 0, 0);

    // Información del Cliente
    
    let currentY = 38;
    currentY += 8;

    // Calcular total m2 de las líneas que no son notas o secciones
    const productLines = detail.order_line.filter(line => line.display_type !== 'line_note' && line.display_type !== 'line_section');
    const totalM2 = productLines.reduce((acc, line) => acc + line.product_uom_qty, 0);
    doc.text(`Total Metros Cuadrados: ${totalM2.toFixed(2)} m²`, 14, currentY);

    // Encabezado de Tabla
    let yPos = currentY + 14;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, yPos - 5, 182, 8, 'F');
    doc.setFont("helvetica", "bold");
    doc.text("Ref", 16, yPos);
    doc.text("Cant.", 43, yPos);
    doc.text("Dim. (mm)", 57, yPos);
    doc.text("Configuración", 84, yPos);
    doc.text("Unitario", 152, yPos);
    doc.text("Total", 176, yPos);
    doc.setFont("helvetica", "normal");

    yPos += 10;

    productLines.forEach((line, index) => {
      const parsed = parseOdooLine(line, index);
      const splitLabel = doc.splitTextToSize(parsed.ref, 25);
      const splitConfig = doc.splitTextToSize(parsed.config, 66);

      const lineCount = Math.max(splitLabel.length, splitConfig.length);

      // Verificar salto de página
      if (yPos + (lineCount * 5) > 275) {
        doc.addPage();
        yPos = 20;
      }

      doc.text(splitLabel, 16, yPos);
      doc.text(parsed.cant, 43, yPos);
      doc.text(parsed.dim, 57, yPos);
      doc.text(splitConfig, 84, yPos);
      
      const displayedCant = parseFloat(parsed.cant) || 1;
      const unitario = Math.round(line.price_subtotal / displayedCant);
      doc.text(`$${unitario.toLocaleString('es-CL')}`, 152, yPos);
      
      doc.text(`$${line.price_subtotal.toLocaleString('es-CL')}`, 176, yPos);

      yPos += (lineCount * 5) + 5;
    });

    // Total
    doc.line(14, yPos, 196, yPos);
    yPos += 10;

    const net = detail.amount_untaxed;
    const tax = detail.amount_tax;
    const total = detail.amount_total;

    doc.setFont("helvetica", "bold");
    doc.text(`Total Neto: $${net.toLocaleString('es-CL')}`, 140, yPos);
    yPos += 6;
    doc.text(`IVA (19%): $${tax.toLocaleString('es-CL')}`, 140, yPos);
    yPos += 6;
    doc.setFontSize(11);
    doc.text(`Total: $${total.toLocaleString('es-CL')}`, 140, yPos);

    // Verificar espacio para notas y firmas
    if (yPos > 200) {
      doc.addPage();
      yPos = 20;
    }

    yPos += 15;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("NOTAS:", 14, yPos);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);

    const notas = [
      "Este presupuesto tiene una validez de 10 días. Cualquier cambio generará otro presupuesto.",
      "Estos valores quedan sujetos a cualquier cambio en el mercado.",
      "Plazo de entrega a contar de 48 horas para Termopaneles, una vez recibida Orden de Compra.",
      "PROWINDOWS LTDA. no responde por los daños de quiebres, rayaduras o picaduras en los cristales aportados por los clientes para recibir servicio de maquila, siendo de responsabilidad del cliente su reposición.",
      "Esperando este Presupuesto sea de su agrado le saluda atentamente:",
      "Una vez emitida la factura, el cliente tiene 24 horas para objetarla, de lo contrario esta se dará por aceptada."
    ];

    if (detail.note) {
      const strippedNote = stripHtml(detail.note);
      if (strippedNote) {
        // Añadir nota al principio de la lista de notas
        notas.unshift(`Observaciones Odoo: ${strippedNote}`);
      }
    }

    notas.forEach((nota) => {
      yPos += 5.5;
      const splitNota = doc.splitTextToSize(nota, 182);
      doc.text(splitNota, 14, yPos);
      yPos += (splitNota.length - 1) * 4.5;
    });

    // Firmas y Modalidad de Pago
    yPos += 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);

    doc.text("Firma de aceptación del Cliente: ___________________________", 14, yPos);
    doc.text("Modalidad de Pago: __________________", 120, yPos);

    const sanitizedClientName = detail.partner_id?.[1] ? detail.partner_id[1].trim().replace(/[^a-zA-Z0-9_-]/g, '_') : 'Sin_Cliente';
    doc.save(`Presupuesto_Odoo_${detail.name}_${sanitizedClientName}.pdf`);
  };

  const handlePrintWorkOrders = async () => {
    if (!detail) return;
    const doc = new jsPDF();

    // 1. Filter and parse the lines
    const productLines = detail.order_line.filter(
      line => line.display_type !== 'line_note' && line.display_type !== 'line_section'
    );

    if (productLines.length === 0) {
      alert("No hay productos válidos en esta cotización para generar órdenes de trabajo.");
      return;
    }

    const parsedItems = productLines.map((line, index) => {
      const name = line.name || "";
      // Handle both pipe-separated (new) and newline-separated (old) formats
      const rawSplit = name.includes(" | ")
        ? name.split(" | ").map(p => p.trim())
        : name.split(/\n/).map(p => p.trim());
      // Old format can have "[V1] Cantidad: 4" merged in one chunk — split it
      const parts: string[] = [];
      for (const rp of rawSplit) {
        const bracketEnd = rp.indexOf("]");
        if (rp.startsWith("[") && bracketEnd !== -1 && bracketEnd < rp.length - 1) {
          parts.push(rp.slice(0, bracketEnd + 1).trim());
          const rest = rp.slice(bracketEnd + 1).trim();
          if (rest) parts.push(rest);
        } else {
          parts.push(rp);
        }
      }

      // Cantidad
      let cantidad = 1;
      const cantPart = parts.find(p => p.toLowerCase().includes("cantidad:"));
      if (cantPart) {
        const match = cantPart.match(/cantidad:\s*(\d+)/i);
        if (match) {
          cantidad = parseInt(match[1], 10) || 1;
        }
      }

      // Dimensiones — soporta "Termopanel 800 x 1200 mm", "Dimensiones: 800 x 1200 mm" y "Cristal Monolítico ..."
      let ancho = 0;
      let alto = 0;
      const dimPart = parts.find(p =>
        /termopanel\s+\d/i.test(p) ||
        /^dimensiones?:/i.test(p) ||
        /cristal monol/i.test(p)
      );
      if (dimPart) {
        const match = dimPart.match(/(\d+)\s*x\s*(\d+)/i);
        if (match) {
          ancho = parseInt(match[1], 10);
          alto = parseInt(match[2], 10);
        }
      } else if (line.x_studio_ancho_m != null && line.x_studio_alto_m != null) {
        ancho = Math.round(line.x_studio_ancho_m * 1000);
        alto = Math.round((line.x_studio_alto_m * 1000) / cantidad);
      }

      // Cristal 1
      const c1Part = parts.find(p => /^(cristal 1|c1|cristal):/i.test(p));
      let cristal1_tipo = "Incoloro";
      let cristal1_espesor = 6;
      if (c1Part) {
        const match = c1Part.match(/^(?:cristal 1|c1|cristal):\s*(.+?)\s+(\d+)\s*mm/i);
        if (match) {
          cristal1_tipo = match[1].trim();
          cristal1_espesor = parseInt(match[2], 10) || 6;
        }
      } else {
        for (const part of parts) {
          const match = part.match(/^(.+?)\s+(\d+)\s*mm$/i);
          if (
            match &&
            !part.toLowerCase().includes("separador") &&
            !part.toLowerCase().includes("sep") &&
            !part.toLowerCase().includes("termopanel") &&
            !part.toLowerCase().includes("monolítico") &&
            !part.toLowerCase().includes("monolitico")
          ) {
            cristal1_tipo = match[1].trim();
            cristal1_espesor = parseInt(match[2], 10) || 6;
            break;
          }
        }
      }

      // Cristal 2
      const c2Part = parts.find(p => /^(cristal 2|c2):/i.test(p));
      let cristal2_tipo = "";
      let cristal2_espesor = 0;
      let hasCristal2 = false;
      if (c2Part) {
        hasCristal2 = true;
        const matchStrict = c2Part.match(/^(?:cristal 2|c2):\s*(.+?)\s+(\d+)\s*mm/i);
        if (matchStrict) {
          cristal2_tipo = matchStrict[1].trim();
          cristal2_espesor = parseInt(matchStrict[2], 10) || 6;
        } else {
          const matchFlex = c2Part.match(/^(?:cristal 2|c2):\s*(.+?)(?:\s+(\d+)\s*mm?)?$/i);
          if (matchFlex) {
            cristal2_tipo = matchFlex[1].trim();
            cristal2_espesor = matchFlex[2] ? (parseInt(matchFlex[2], 10) || 6) : 6;
          }
        }
      }

      // Separador
      const sepPart = parts.find(p => /^(separador|sep)(?:-|:)/i.test(p));
      let sep_espesor = 0;
      let sep_color = "";
      let hasSeparador = false;
      if (sepPart) {
        hasSeparador = true;
        const sepMatch1 = sepPart.match(/separador(?:-|:)\s*(\d+)\s*mm\s+color\s+(.+)/i);
        if (sepMatch1) {
          sep_espesor = parseInt(sepMatch1[1]);
          sep_color = sepMatch1[2].trim();
        } else {
          // Flexible: "Separador: 12mm - Negro", "Separador: 12mm Negro", "Sep: 12mm color Negro"
          const sepMatch2 = sepPart.match(/(?:separador|sep)[:\-]\s*(\d+)\s*mm?(?:\s+(?:color\s+)?|\s*-\s*)(.+)?/i);
          if (sepMatch2) {
            sep_espesor = parseInt(sepMatch2[1]) || 12;
            sep_color = (sepMatch2[2] || "Negro").trim();
          }
        }
      }

      // Label / Ref — extrae el contenido entre [ ] al inicio (sin requerir fin de cadena)
      let label = `V${index + 1}`;
      const refMatch = parts[0]?.match(/^\[([^\]]+)\]/);
      if (refMatch) {
        label = refMatch[1];
      }

      // Extras text
      const extrasPart = parts.find(p => p.toLowerCase().startsWith("extras:"));
      let extrasText = "";
      if (extrasPart) {
        extrasText = extrasPart.trim();
      } else {
        const otherParts = parts.filter(
          p =>
            !p.startsWith("[") &&
            !p.toLowerCase().includes("cantidad:") &&
            !p.toLowerCase().includes("termopanel") &&
            !p.toLowerCase().includes("monolítico") &&
            !p.toLowerCase().includes("monolitico") &&
            !p.toLowerCase().startsWith("cristal 1") &&
            !p.toLowerCase().startsWith("c1:") &&
            !p.toLowerCase().startsWith("cristal 2") &&
            !p.toLowerCase().startsWith("c2:") &&
            !p.toLowerCase().startsWith("separador") &&
            !p.toLowerCase().startsWith("sep:") &&
            !p.toLowerCase().startsWith("cristal:")
        );
        if (otherParts.length > 0) {
          extrasText = `Extras: ${otherParts.join(", ")}`;
        }
      }

      const isTermopanel = name.toLowerCase().includes("termopanel") || hasCristal2 || hasSeparador || cristal2_espesor > 0 || sep_espesor > 0;

      return {
        label,
        cantidad,
        ancho,
        alto,
        cristal1: { tipo: cristal1_tipo, espesor: cristal1_espesor },
        cristal2: hasCristal2 ? { tipo: cristal2_tipo, espesor: cristal2_espesor } : null,
        separador: hasSeparador ? { espesor: sep_espesor, color: sep_color } : null,
        extrasText,
        isTermopanel,
      };
    });

    const hasTermopaneles = parsedItems.some(item => item.isTermopanel);
    const totalM2 = parsedItems.reduce((acc, item) => acc + ((item.ancho * item.alto) / 1000000) * item.cantidad, 0);

    // Load logo
    let logoBase64: string | null = null;
    try {
      const res = await fetch('/logo.png');
      const blob = await res.blob();
      logoBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error("Error al cargar el logo en el PDF", e);
    }

    const clientName = detail.partner_id?.[1] ?? "Sin Cliente";

    // ======================================================
    // PÁGINA 1: TALLER CORTE VIDRIO
    // ======================================================
    if (logoBase64) doc.addImage(logoBase64, 'PNG', 14, 10, 36, 18);

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("ORDEN DE TRABAJO", 105, 20, { align: "center" });
    doc.setFontSize(13);
    doc.setTextColor(80, 80, 80);
    doc.text("Taller Corte Vidrio", 105, 28, { align: "center" });
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Ref: ${detail.name}`, 196, 13, { align: "right" });
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-CL')}`, 196, 20, { align: "right" });
    doc.text(`Cliente: ${clientName}`, 196, 27, { align: "right" });
    doc.setTextColor(0, 0, 0);
    let topHeaderOffset = 38;

    // Line separator
    doc.setDrawColor(200, 200, 200);
    doc.line(14, topHeaderOffset, 196, topHeaderOffset);

    // Header table Corte Vidrio
    let yPos = topHeaderOffset + 10;
    doc.setFillColor(51, 65, 85); // slate-700
    doc.rect(14, yPos - 6, 182, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Ref", 17, yPos);
    doc.text("Ancho (mm)", 36, yPos);
    doc.text("Alto (mm)", 58, yPos);
    doc.text("Cant.", 77, yPos);
    doc.text("Cristal 1", 89, yPos);
    doc.text("Cant.", 138, yPos);
    doc.text("Cristal 2", 150, yPos);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");

    yPos += 8;

    parsedItems.forEach((item, index) => {
      const splitLabel = doc.splitTextToSize(item.label, 28);
      const rowHeight = item.extrasText ? 14 : Math.max(8, (splitLabel.length * 4) + 4);

      if (yPos + rowHeight > 275) {
        doc.addPage();
        yPos = 20;
        // Repeat header
        doc.setFillColor(51, 65, 85);
        doc.rect(14, yPos - 6, 182, 9, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("Ref", 17, yPos);
        doc.text("Ancho (mm)", 36, yPos);
        doc.text("Alto (mm)", 58, yPos);
        doc.text("Cant.", 77, yPos);
        doc.text("Cristal 1", 89, yPos);
        doc.text("Cant.", 138, yPos);
        doc.text("Cristal 2", 150, yPos);
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");
        yPos += 8;
      }

      // Alternating row background
      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 252); // slate-50
        doc.rect(14, yPos - 5, 182, rowHeight, 'F');
      }

      doc.setFontSize(9);
      doc.text(splitLabel, 17, yPos);
      doc.setFont("helvetica", "bold");
      doc.text(`${item.ancho}`, 36, yPos);
      doc.text(`${item.alto}`, 58, yPos);
      doc.setFont("helvetica", "normal");
      doc.text(`${item.cantidad}`, 79, yPos);
      doc.text(`${item.cristal1.tipo} ${item.cristal1.espesor}mm`, 89, yPos);
      if (item.cristal2) {
        doc.text(`${item.cantidad}`, 140, yPos);
        doc.text(`${item.cristal2.tipo} ${item.cristal2.espesor}mm`, 150, yPos);
      } else {
        doc.text("—", 140, yPos);
        doc.text("—", 150, yPos);
      }

      if (item.extrasText) {
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(item.extrasText, 110, yPos + 4.5);
        doc.setTextColor(0, 0, 0);
      }

      yPos += rowHeight;
    });

    // Close line
    doc.setDrawColor(200, 200, 200);
    doc.line(14, yPos, 196, yPos);

    yPos += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`Total a cortar: ${totalM2.toFixed(2)} m²`, 14, yPos);

    // Footnote
    yPos += 8;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text("* Las medidas de los cristales corresponden al termopanel completo. Ajustar descuentos según separador.", 14, yPos);

    // ======================================================
    // PÁGINA 2: TALLER TERMOPANELES
    // ======================================================
    if (hasTermopaneles) {
      doc.addPage();

      if (logoBase64) doc.addImage(logoBase64, 'PNG', 14, 10, 36, 18);

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("ORDEN DE TRABAJO", 105, 20, { align: "center" });
      doc.setFontSize(13);
      doc.setTextColor(80, 80, 80);
      doc.text("Taller Termopaneles", 105, 28, { align: "center" });
      doc.setTextColor(0, 0, 0);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(`Ref: ${detail.name}`, 196, 13, { align: "right" });
      doc.text(`Fecha: ${new Date().toLocaleDateString('es-CL')}`, 196, 20, { align: "right" });
      doc.text(`Cliente: ${clientName}`, 196, 27, { align: "right" });
      doc.setTextColor(0, 0, 0);
      topHeaderOffset = 38;

      // Line separator
      doc.setDrawColor(200, 200, 200);
      doc.line(14, topHeaderOffset, 196, topHeaderOffset);

      // Header table Termopaneles
      yPos = topHeaderOffset + 10;
      doc.setFillColor(15, 118, 110); // teal-700
      doc.rect(14, yPos - 6, 182, 9, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Ref", 17, yPos);
      doc.text("Cant.", 47, yPos);
      doc.text("Ancho", 58, yPos);
      doc.text("Alto", 73, yPos);
      doc.text("Cristal 1", 88, yPos);
      doc.text("Cristal 2", 121, yPos);
      doc.text("Sep. (mm)", 154, yPos);
      doc.text("Color Sep.", 175, yPos);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");

      yPos += 8;

      const termopanelItems = parsedItems.filter(item => item.isTermopanel);
      termopanelItems.forEach((item, index) => {
        const splitLabel = doc.splitTextToSize(item.label, 28);
        const rowHeight = item.extrasText ? 14 : Math.max(8, (splitLabel.length * 4) + 4);

        if (yPos + rowHeight > 275) {
          doc.addPage();
          yPos = 20;
          // Repeat header
          doc.setFillColor(15, 118, 110);
          doc.rect(14, yPos - 6, 182, 9, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.text("Ref", 17, yPos);
          doc.text("Cant.", 47, yPos);
          doc.text("Ancho", 58, yPos);
          doc.text("Alto", 73, yPos);
          doc.text("Cristal 1", 88, yPos);
          doc.text("Cristal 2", 121, yPos);
          doc.text("Sep. (mm)", 154, yPos);
          doc.text("Color Sep.", 175, yPos);
          doc.setTextColor(0, 0, 0);
          doc.setFont("helvetica", "normal");
          yPos += 8;
        }

        // Alternating row background
        if (index % 2 === 0) {
          doc.setFillColor(240, 253, 250); // teal-50
          doc.rect(14, yPos - 5, 182, rowHeight, 'F');
        }

        doc.setFontSize(9);
        doc.text(splitLabel, 17, yPos);
        doc.text(`${item.cantidad}`, 47, yPos);
        doc.setFont("helvetica", "bold");
        doc.text(`${item.ancho}`, 58, yPos);
        doc.text(`${item.alto}`, 73, yPos);
        doc.setFont("helvetica", "normal");
        doc.text(`${item.cristal1.tipo} ${item.cristal1.espesor}mm`, 88, yPos);
        if (item.cristal2) {
          doc.text(`${item.cristal2.tipo} ${item.cristal2.espesor}mm`, 121, yPos);
        } else {
          doc.text("—", 121, yPos);
        }
        if (item.separador) {
          doc.setFont("helvetica", "bold");
          doc.text(`${item.separador.espesor}`, 154, yPos);
          doc.text(`${item.separador.color}`, 175, yPos);
          doc.setFont("helvetica", "normal");
        } else {
          doc.text("—", 154, yPos);
          doc.text("—", 175, yPos);
        }

        if (item.extrasText) {
          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          doc.text(item.extrasText, 88, yPos + 4.5);
          doc.setTextColor(0, 0, 0);
        }

        yPos += rowHeight;
      });

      // Close line
      doc.setDrawColor(200, 200, 200);
      doc.line(14, yPos, 196, yPos);

      yPos += 8;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      const termopanelM2 = termopanelItems.reduce((acc, item) => acc + ((item.ancho * item.alto) / 1000000) * item.cantidad, 0);
      doc.text(`Total a armar: ${termopanelM2.toFixed(2)} m²`, 14, yPos);
    }

    const sanitizedClientName = clientName ? clientName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : 'Sin_Cliente';
    doc.save(`Ordenes_Trabajo_${detail.name}_${sanitizedClientName}.pdf`);
  };

  // â”€â”€ Pagination â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* â”€â”€ Header â”€â”€ */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
          >
            <ArrowLeft size={16} />
            Volver
          </a>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#7a5973]/10 rounded-lg">
              <FileText size={18} className="text-[#7a5973]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight">Cotizaciones Odoo</h1>
              <p className="text-xs text-slate-400">Listado de órdenes de venta almacenadas en el sistema</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-2 bg-[#7a5973] hover:bg-[#6b4c64] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all duration-200 disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Actualizar
        </button>
      </div>

      <div className="flex h-[calc(100vh-73px)]">
        {/* â”€â”€ Left panel: List â”€â”€ */}
        <div className={`flex flex-col ${selectedId ? "hidden lg:flex lg:w-[52%]" : "w-full"} border-r border-slate-200 bg-white`}>
          
          {/* Filters */}
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Buscar por N° orden o cliente..."
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#7a5973]/30 focus:border-[#7a5973] text-slate-700 placeholder-slate-400 bg-slate-50/50"
              />
            </div>

            <div className="flex justify-between items-center gap-2 flex-wrap">
              <div className="flex gap-2 flex-wrap">
                {[
                  { val: "", label: "Todos" },
                  { val: "draft", label: "Borrador" },
                  { val: "sale", label: "Confirmado" },
                  { val: "cancel", label: "Cancelado" },
                ].map(({ val, label }) => (
                  <button
                    key={val}
                    onClick={() => handleStateChange(val)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      stateFilter === val
                        ? "bg-[#7a5973] text-white border-[#7a5973] shadow-sm"
                        : "bg-white text-slate-600 border-slate-200 hover:border-[#7a5973]/40 hover:text-[#7a5973]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Ordenar */}
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-slate-400 font-medium">Ordenar:</span>
                <select
                  value={sortBy}
                  onChange={(e) => handleSortChange(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-slate-600 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#7a5973] focus:border-[#7a5973] cursor-pointer"
                >
                  <option value="id desc">Recientes</option>
                  <option value="partner_id asc">Cliente (A-Z)</option>
                  <option value="partner_id desc">Cliente (Z-A)</option>
                  <option value="name asc">N° Cotización (A-Z)</option>
                  <option value="name desc">N° Cotización (Z-A)</option>
                  <option value="amount_total desc">Monto (Mayor)</option>
                  <option value="amount_total asc">Monto (Menor)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Stats bar */}
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              {loading ? "Cargando..." : `${total} cotización${total !== 1 ? "es" : ""} encontrada${total !== 1 ? "s" : ""}`}
            </span>
            {totalPages > 1 && (
              <span>Página {page + 1} de {totalPages}</span>
            )}
          </div>

          {/* List content */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 text-[#7a5973] animate-spin" />
                <p className="text-sm text-slate-500">Cargando cotizaciones...</p>
              </div>
            )}

            {!loading && error && (
              <div className="m-4 bg-red-50 border border-red-200 rounded-xl p-5 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
                  <AlertTriangle size={16} />
                  Error al cargar
                </div>
                <p className="text-xs text-red-600">{error}</p>
                <button
                  onClick={handleRefresh}
                  className="self-start mt-1 bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  Reintentar
                </button>
              </div>
            )}

            {!loading && !error && orders.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-400">
                <FileText size={40} strokeWidth={1.2} />
                <p className="text-sm font-medium">No se encontraron cotizaciones</p>
                <p className="text-xs">Prueba cambiando los filtros de búsqueda</p>
              </div>
            )}

            {!loading && !error && orders.length > 0 && (
              <div className="divide-y divide-slate-100">
                {orders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => openDetail(order.id)}
                    className={`w-full text-left px-4 py-3.5 hover:bg-slate-50 transition-colors group ${
                      selectedId === order.id ? "bg-[#7a5973]/5 border-l-2 border-[#7a5973]" : "border-l-2 border-transparent"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-1.5 bg-slate-100 rounded-md group-hover:bg-[#7a5973]/10 transition-colors flex-shrink-0">
                          <Layers size={14} className="text-slate-500 group-hover:text-[#7a5973] transition-colors" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800 text-sm">{order.name}</span>
                            <StateBadge state={order.state} />
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {order.partner_id?.[1] ?? "â€”"}
                          </p>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-sm font-bold text-slate-800 font-mono">{formatCLP(order.amount_total)}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{formatDate(order.date_order)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-slate-100 p-3 flex items-center justify-between bg-white">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <span className="text-xs text-slate-500 font-medium">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* â”€â”€ Right panel: Detail â”€â”€ */}
        {selectedId && (
          <div className="flex-1 flex flex-col bg-white overflow-hidden">
            {/* Detail header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={closeDetail}
                  className="lg:hidden p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-500"
                >
                  <ArrowLeft size={16} />
                </button>
                <h2 className="font-bold text-slate-800 text-base">
                  {detail ? detail.name : `Cargando...`}
                </h2>
                {detail && <StateBadge state={detail.state} />}
              </div>
              <button
                onClick={closeDetail}
                className="hidden lg:flex p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-500"
              >
                <X size={16} />
              </button>
            </div>

            {/* Detail content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {detailLoading && (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-8 h-8 text-[#7a5973] animate-spin" />
                  <p className="text-sm text-slate-500">Cargando detalle...</p>
                </div>
              )}

              {detailError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-2 items-start text-red-700 text-sm">
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                  <p>{detailError}</p>
                </div>
              )}

              {detail && (
                <>
                  {/* Info cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        <User size={11} /> Cliente
                      </div>
                      <p className="text-sm font-semibold text-slate-700 leading-snug">
                        {detail.partner_id?.[1] ?? "—"}
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        <Calendar size={11} /> Fecha
                      </div>
                      <p className="text-sm font-semibold text-slate-700">
                        {formatDate(detail.date_order)}
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        <DollarSign size={11} /> Neto
                      </div>
                      <p className="text-sm font-bold text-slate-800 font-mono">
                        {formatCLP(detail.amount_untaxed)}
                      </p>
                    </div>

                    <div className="bg-[#7a5973]/5 border border-[#7a5973]/20 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 text-[#7a5973]/60 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        <DollarSign size={11} /> Total c/IVA
                      </div>
                      <p className="text-sm font-black text-[#7a5973] font-mono">
                        {formatCLP(detail.amount_total)}
                      </p>
                    </div>
                  </div>

                  {/* IVA breakdown */}
                  {detail.amount_tax > 0 && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 -mt-2 px-1">
                      <span>Neto: <strong className="text-slate-700">{formatCLP(detail.amount_untaxed)}</strong></span>
                      <span>+</span>
                      <span>IVA (19%): <strong className="text-slate-700">{formatCLP(detail.amount_tax)}</strong></span>
                      <span>=</span>
                      <span>Total: <strong className="text-slate-700">{formatCLP(detail.amount_total)}</strong></span>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {detail.state === 'draft' && (
                        <button
                          onClick={handleEditarCotizacion}
                          className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-lg font-semibold transition-colors shadow-sm"
                        >
                          <Edit3 size={12} />
                          Editar Cotización
                        </button>
                      )}

                      {detail.state === 'cancel' && (
                        <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">
                          <XCircle size={12} />
                          Esta orden fue cancelada
                        </div>
                      )}

                      {(detail.state === 'sale' || detail.state === 'done') && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                          <Check size={12} />
                          Orden confirmada â€” solo lectura
                        </div>
                      )}

                      {detail.state === 'draft' && (
                        <button
                          onClick={handleConfirmar}
                          disabled={confirming || cancelling}
                          className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-60"
                        >
                          <Check size={12} />
                          {confirming ? 'Confirmando y creando órdenes...' : 'Confirmar y Crear Órdenes de Taller'}
                        </button>
                      )}

                      {detail.state === 'draft' && (
                        <button
                          onClick={handleCancel}
                          disabled={cancelling}
                          className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-60"
                        >
                          <Ban size={12} />
                          {cancelling ? "Cancelando..." : "Cancelar Orden"}
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2 items-center">
                      <button
                        onClick={handleEditarCotizacion}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition-all duration-200"
                        title="Abrir esta cotización para editarla"
                      >
                        <Edit3 size={13} />
                        Editar
                      </button>

                      <button
                        onClick={handlePrintPDF}
                        className="flex items-center gap-2 bg-[#7a5973] hover:bg-[#6b4c64] text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition-all duration-200"
                        title="Volver a generar e imprimir el PDF de este presupuesto"
                      >
                        <Printer size={13} />
                        Imprimir PDF
                      </button>

                      <button
                        onClick={handlePrintWorkOrders}
                        className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition-all duration-200"
                        title="Generar e imprimir el PDF de las órdenes de trabajo (Taller)"
                      >
                        <Printer size={13} />
                        Imprimir OTs (Taller)
                      </button>
                    </div>
                  </div>

                  {/* Order lines */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                      <Layers size={15} className="text-[#7a5973]" />
                      Líneas del Pedido
                      <span className="text-xs font-normal text-slate-400">({detail.order_line.length} línea{detail.order_line.length !== 1 ? "s" : ""})</span>
                    </h3>

                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      {detail.order_line.length === 0 ? (
                        <p className="p-4 text-sm text-slate-400 italic text-center">Sin líneas de pedido</p>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {detail.order_line.map((line) => {
                            const isNote = line.display_type === 'line_note' || line.display_type === 'line_section';

                            if (isNote) {
                              return (
                                <div key={line.id} className="px-4 py-2.5 bg-slate-50/50">
                                  <p className="text-xs text-slate-500 italic">{line.name}</p>
                                </div>
                              );
                            }

                            return (
                              <div key={line.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                                <div className="flex flex-col gap-3">
                                  {/* Description */}
                                  <p className="text-xs text-slate-700 leading-relaxed">{line.name}</p>
                                  
                                  {/* Metrics row */}
                                  <div className="flex items-start gap-4 flex-wrap">
                                    {/* Quantity */}
                                    <div className="flex flex-col gap-1 min-w-[90px]">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cantidad (m²)</span>
                                      <span className="text-sm font-bold text-slate-700 font-mono">{line.product_uom_qty.toFixed(2)}</span>
                                    </div>

                                    {/* Price unit */}
                                    <div className="flex flex-col gap-1 min-w-[120px]">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Precio Unit.</span>
                                      <span className="text-sm font-bold text-slate-700 font-mono">{formatCLP(line.price_unit)}</span>
                                    </div>

                                    {/* Valor Neto */}
                                    <div className="flex flex-col gap-1 min-w-[120px]">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valor Neto</span>
                                      <span className="text-sm font-black text-slate-800 font-mono">
                                        {formatCLP(line.price_subtotal)}
                                      </span>
                                    </div>

                                    {/* % Descuento */}
                                    <div className="flex flex-col gap-1 min-w-[80px]">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">% Desc.</span>
                                      <span className="text-sm font-bold text-slate-700 font-mono">
                                        {(line.discount ?? 0) > 0 ? `${(line.discount ?? 0).toFixed(1)}%` : <span className="text-slate-300">—</span>}
                                      </span>
                                    </div>

                                    {/* Dimensions */}
                                    {line.x_studio_ancho_m != null && (
                                      <div className="flex flex-col gap-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Medidas (m)</span>
                                        <span className="text-xs text-slate-600 font-mono">
                                          {line.x_studio_ancho_m?.toFixed(3)} × {line.x_studio_alto_m?.toFixed(3)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Note */}
                  {detail.note && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1.5">Notas</p>
                      <p className="text-xs text-blue-800 leading-relaxed" dangerouslySetInnerHTML={{ __html: detail.note }} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* â”€â”€ Empty detail state (desktop) â”€â”€ */}
        {!selectedId && (
          <div className="hidden lg:flex flex-1 flex-col items-center justify-center gap-4 bg-slate-50/30 text-slate-400">
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
              <Eye size={40} strokeWidth={1.2} className="text-slate-300" />
            </div>
            <p className="text-sm font-medium">Selecciona una cotización para ver su detalle</p>
            <p className="text-xs">Haz clic en cualquier fila de la lista</p>
          </div>
        )}
      </div>
    </div>
  );
}
