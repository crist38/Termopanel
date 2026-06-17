"use client"

import { useState, useEffect, Suspense } from "react"
import { TermopanelItem, calcularItem, calcularTotal, calcularPrecioUnitario, PARAMETROS_DEFAULT } from "@/lib/calculos/termopanel"
import { collection, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getTermopanelConfig, TermopanelConfig, getPrecioSeparadorPorMl, PRECIOS_SEPARADORES_DEFAULT } from '@/lib/configService';
import { useSearchParams, useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
import { Plus, Trash2, Cloud, ArrowLeft, BarChart2, Triangle, RotateCcw, Printer } from 'lucide-react';
import { guardarCotizacionEnOdoo, obtenerCotizacionParaEditar, actualizarCotizacionEnOdoo } from '@/app/actions/odoo';
import { ClientSelector } from '@/components/ClientSelector';

type ShapeType = 'rectangulo' | 'triangulo' | 'trapecio' | 'arco';

const drawShapeInPdf = (
  doc: jsPDF,
  shape: string,
  x: number,
  y: number,
  w: number,
  h: number,
  med: { a: number; b: number; b1?: number; b2?: number }
) => {
  doc.setLineWidth(0.3);
  doc.setDrawColor(71, 85, 105);   // Slate-600
  doc.setFillColor(241, 245, 249); // Slate-100

  if (shape === 'rectangulo') {
    doc.rect(x, y, w, h, 'FD');
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
    const maxVal = (b + a / 2) || 1;
    
    const hBaseScaled = (b / maxVal) * h;
    const rScaled = ((a / 2) / maxVal) * h;
    
    const yBottom = y + h;
    const yBaseTop = yBottom - hBaseScaled;
    const cx = x + w / 2;
    const r = w / 2;

    doc.rect(x, yBaseTop, w, hBaseScaled, 'FD');

    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const a1 = i * Math.PI / steps;
      const a2 = (i + 1) * Math.PI / steps;
      const x1 = cx + r * Math.cos(Math.PI + a1);
      const y1 = yBaseTop - r * Math.sin(Math.PI + a1);
      const x2 = cx + r * Math.cos(Math.PI + a2);
      const y2 = yBaseTop - r * Math.sin(Math.PI + a2);
      doc.triangle(cx, yBaseTop, x1, y1, x2, y2, 'FD');
    }
    
    doc.line(x, yBottom, x + w, yBottom);
    doc.line(x, yBottom, x, yBaseTop);
    doc.line(x + w, yBottom, x + w, yBaseTop);
    
    for (let i = 0; i < steps; i++) {
      const a1 = i * Math.PI / steps;
      const a2 = (i + 1) * Math.PI / steps;
      const x1 = cx + r * Math.cos(Math.PI + a1);
      const y1 = yBaseTop - r * Math.sin(Math.PI + a1);
      const x2 = cx + r * Math.cos(Math.PI + a2);
      const y2 = yBaseTop - r * Math.sin(Math.PI + a2);
      doc.line(x1, y1, x2, y2);
    }
  }

  doc.setLineWidth(0.2);
  doc.setDrawColor(0, 0, 0);
  doc.setFillColor(255, 255, 255);
};

function ShapesCADCotizadorContent() {
  const [config, setConfig] = useState<TermopanelConfig | null>(null);
  const [tiposUnicos, setTiposUnicos] = useState<string[]>([]);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  // Active form state (new item)
  const [shape, setShape] = useState<ShapeType>('rectangulo');
  const [medidaA, setMedidaA] = useState<number>(1000);   // mm (base or width)
  const [medidaB, setMedidaB] = useState<number>(1000);   // mm (height or Left height or base height)
  const [medidaB1, setMedidaB1] = useState<number>(1500); // mm (Left height for trapezoid)
  const [medidaB2, setMedidaB2] = useState<number>(1000); // mm (Right height for trapezoid)
  const [cantidad, setCantidad] = useState<number>(1);
  
  const [cristal1Tipo, setCristal1Tipo] = useState<string>('Incoloro');
  const [cristal1Espesor, setCristal1Espesor] = useState<number>(4);
  const [cristal2Tipo, setCristal2Tipo] = useState<string>('Incoloro');
  const [cristal2Espesor, setCristal2Espesor] = useState<number>(4);
  const [separadorEspesor, setSeparadorEspesor] = useState<number>(10);
  const [separadorColor, setSeparadorColor] = useState<string>('Mate');
  
  const [pulido, setPulido] = useState<boolean>(false);
  const [micropersiana, setMicropersiana] = useState<boolean>(false);
  const [palillaje, setPalillaje] = useState<boolean>(false);
  const [palillajeColor, setPalillajeColor] = useState<string>('Blanco');
  const [palillajeHorizontales, setPalillajeHorizontales] = useState<number>(0);
  const [palillajeVerticales, setPalillajeVerticales] = useState<number>(0);
  const [descuento, setDescuento] = useState<number>(0);

  // Added items list
  const [items, setItems] = useState<TermopanelItem[]>([]);

  // Client info
  const [clientName, setClientName] = useState('');
  const [obra, setObra] = useState('');
  const [clientId, setClientId] = useState<number | undefined>(undefined);
  const [budgetName, setBudgetName] = useState('Borrador');
  const [budgetDate, setBudgetDate] = useState('');

  // Estados para guardado automático (Auto-save)
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftData, setDraftData] = useState<any>(null);
  const [draftTime, setDraftTime] = useState("");

  const searchParams = useSearchParams();
  const editId = searchParams.get('editId');

  const [isSyncingOdoo, setIsSyncingOdoo] = useState(false);
  const [sessionName, setSessionName] = useState<string>('');
  const router = useRouter();

  // Load config
  useEffect(() => {
    const fetchConfig = async () => {
      setIsLoadingConfig(true);
      const conf = await getTermopanelConfig();
      setConfig(conf);
      if (conf.vidrios?.length > 0) {
        const uniqueTypes = Array.from(new Set(conf.vidrios.map(v => v.tipo)));
        setTiposUnicos(uniqueTypes);
        // Set initial select values
        if (uniqueTypes.includes('Incoloro')) {
          setCristal1Tipo('Incoloro');
          setCristal2Tipo('Incoloro');
        } else if (uniqueTypes.length > 0) {
          setCristal1Tipo(uniqueTypes[0]);
          setCristal2Tipo(uniqueTypes[0]);
        }
      }
      setIsLoadingConfig(false);
    };
    fetchConfig();
  }, []);

  // Sync cookie session name
  useEffect(() => {
    const cookieVal = document.cookie
      .split('; ')
      .find((r) => r.startsWith('odoo_user='))
      ?.split('=')
      .slice(1)
      .join('=')
    if (cookieVal) {
      try {
        const parsed = JSON.parse(decodeURIComponent(cookieVal))
        setSessionName(parsed.name || parsed.email || '')
      } catch {}
    }
  }, []);

  // Cargar cotización para editar
  useEffect(() => {
    if (!editId) return;

    const loadBudget = async () => {
      try {
        const isOdooId = /^\d+$/.test(editId);
        if (isOdooId) {
          const res = await obtenerCotizacionParaEditar(parseInt(editId));
          if (res.exito) {
            setClientName(res.clientName || '');
            setClientId(res.clientId);
            setObra(res.obra || '');
            setBudgetName(res.budgetName || 'Borrador');
            setItems(res.items || []);
          } else {
            alert(`Error al cargar cotización de Odoo: ${res.error}`);
          }
        }
      } catch (e) {
        console.error("Error loading budget:", e);
      }
    };
    loadBudget();
  }, [editId]);

  // Detectar borrador guardado en localStorage al montar el componente
  useEffect(() => {
    if (editId) return;

    const savedDraft = localStorage.getItem('formas_cotizacion_draft');
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        const hasData = parsed.clientName || parsed.obra || (parsed.items && parsed.items.length > 0);
        if (hasData) {
          setDraftData(parsed);
          setDraftTime(new Date(parsed.timestamp).toLocaleString('es-CL'));
          setShowDraftBanner(true);
        }
      } catch (e) {
        console.error("Error al cargar borrador guardado:", e);
      }
    }
  }, [editId]);

  // Guardado automático en localStorage con debounce
  useEffect(() => {
    if (editId) return;

    // Si los campos están vacíos/iniciales, no creamos/mantenemos borrador sucio
    const hasAnyContent = clientName.trim() !== '' || obra.trim() !== '' || (items && items.length > 0);
    if (!hasAnyContent) {
      localStorage.removeItem('formas_cotizacion_draft');
      return;
    }

    const timer = setTimeout(() => {
      const draft = {
        clientName,
        obra,
        clientId,
        items,
        timestamp: Date.now()
      };
      localStorage.setItem('formas_cotizacion_draft', JSON.stringify(draft));
    }, 1000);

    return () => clearTimeout(timer);
  }, [clientName, obra, clientId, items, editId]);

  const handleRestoreDraft = () => {
    if (!draftData) return;
    setClientName(draftData.clientName || '');
    setObra(draftData.obra || '');
    setClientId(draftData.clientId);
    if (draftData.items && draftData.items.length > 0) {
      setItems(draftData.items);
    }
    setShowDraftBanner(false);
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem('formas_cotizacion_draft');
    setShowDraftBanner(false);
    setDraftData(null);
  };

  // Update default espesor when tipo changes
  const getEspesores = (tipo: string) => {
    if (!config) return [];
    return config.vidrios.filter(v => v.tipo === tipo).map(v => v.espesor).sort((a, b) => a - b);
  };

  useEffect(() => {
    if (!config || cristal1Tipo === '') return;
    const esp = getEspesores(cristal1Tipo);
    if (esp.length > 0 && !esp.includes(cristal1Espesor)) {
      setCristal1Espesor(esp[0]);
    }
  }, [cristal1Tipo, config]);

  useEffect(() => {
    if (!config || cristal2Tipo === '') return;
    const esp = getEspesores(cristal2Tipo);
    if (esp.length > 0 && !esp.includes(cristal2Espesor)) {
      setCristal2Espesor(esp[0]);
    }
  }, [cristal2Tipo, config]);

  const getPrecioVidrio = (tipo: string, espesor: number) => {
    if (!config) return 0;
    return config.vidrios.find(v => v.tipo === tipo && v.espesor === espesor)?.precio || 0;
  };

  // Geometry calculations for preview
  const getBoundingBox = () => {
    if (shape === 'rectangulo') return { w: medidaA, h: medidaB };
    if (shape === 'triangulo') return { w: medidaA, h: medidaB };
    if (shape === 'trapecio') return { w: medidaA, h: Math.max(medidaB1, medidaB2) };
    if (shape === 'arco') return { w: medidaA, h: medidaB + medidaA / 2 };
    return { w: 1000, h: 1000 };
  };

  const getCalculatedArea = () => {
    if (shape === 'rectangulo') return (medidaA * medidaB) / 1_000_000;
    if (shape === 'triangulo') return (medidaA * medidaB) / 2_000_000;
    if (shape === 'trapecio') return medidaA * ((medidaB1 + medidaB2) / 2) / 1_000_000;
    if (shape === 'arco') return (medidaA * medidaB + (Math.PI * Math.pow(medidaA / 2, 2)) / 2) / 1_000_000;
    return 1;
  };

  const getCalculatedPerimeter = () => {
    if (shape === 'rectangulo') return 2 * (medidaA + medidaB) / 1000;
    if (shape === 'triangulo') return (medidaA + medidaB + Math.sqrt(medidaA * medidaA + medidaB * medidaB)) / 1000;
    if (shape === 'trapecio') return (medidaA + medidaB1 + medidaB2 + Math.sqrt(medidaA * medidaA + Math.pow(Math.abs(medidaB1 - medidaB2), 2))) / 1000;
    if (shape === 'arco') return (medidaA + 2 * medidaB + (Math.PI * medidaA) / 2) / 1000;
    return 4;
  };

  // Temp item for live calculations
  const tempItem: TermopanelItem = {
    id: 'temp',
    cantidad: cantidad,
    ancho: getBoundingBox().w,
    alto: getBoundingBox().h,
    cristal1: { tipo: cristal1Tipo, espesor: cristal1Espesor },
    cristal2: { tipo: cristal2Tipo, espesor: cristal2Espesor },
    separador: { color: separadorColor, espesor: separadorEspesor },
    pulido,
    micropersiana,
    palillaje,
    palillajeColor,
    palillajeHorizontales,
    palillajeVerticales,
    conForma: true, // Siempre tiene forma especial en esta página
    tipoFigura: shape,
    medidasFigura: {
      a: medidaA,
      b: shape === 'trapecio' ? Math.max(medidaB1, medidaB2) : medidaB,
      b1: shape === 'trapecio' ? medidaB1 : undefined,
      b2: shape === 'trapecio' ? medidaB2 : undefined
    },
    descuento,
    precioUnitario: 0
  };

  const p1 = getPrecioVidrio(cristal1Tipo, cristal1Espesor);
  const p2 = getPrecioVidrio(cristal2Tipo, cristal2Espesor);
  const seps = config?.preciosSeparadores?.length ? config.preciosSeparadores : PRECIOS_SEPARADORES_DEFAULT;
  const precioSep = getPrecioSeparadorPorMl(seps, separadorColor, separadorEspesor);
  const params = { ...PARAMETROS_DEFAULT, ...(config?.parametrosCalculo ?? {}) };

  const computedUnitPrice = calcularPrecioUnitario(tempItem, p1, p2, precioSep, params);
  const computedTotalLine = computedUnitPrice * cantidad;

  // Add Item to List
  const handleAddItem = () => {
    const bounding = getBoundingBox();
    const newItem: TermopanelItem = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
      label: `V${items.length + 1}`,
      cantidad,
      ancho: bounding.w,
      alto: bounding.h,
      cristal1: { tipo: cristal1Tipo, espesor: cristal1Espesor },
      cristal2: { tipo: cristal2Tipo, espesor: cristal2Espesor },
      separador: { color: separadorColor, espesor: separadorEspesor },
      pulido,
      micropersiana,
      palillaje,
      palillajeColor,
      palillajeHorizontales,
      palillajeVerticales,
      conForma: true,
      tipoFigura: shape,
      medidasFigura: {
        a: medidaA,
        b: shape === 'trapecio' ? Math.max(medidaB1, medidaB2) : medidaB,
        b1: shape === 'trapecio' ? medidaB1 : undefined,
        b2: shape === 'trapecio' ? medidaB2 : undefined
      },
      descuento,
      precioUnitario: computedUnitPrice
    };

    setItems([...items, newItem]);
    // Reset sizes to default but preserve glass specs
    setCantidad(1);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  // Totals of list
  const totalNeto = items.reduce((acc, item) => acc + item.precioUnitario * item.cantidad, 0);

  // PDF and Odoo functions
  const handleProcessQuote = async () => {
    if (!clientName) {
      alert("Por favor ingrese el nombre del cliente para procesar la cotización");
      return;
    }
    setIsSyncingOdoo(true);
    try {
      let odooRes;
      const isOdooId = editId && /^\d+$/.test(editId);
      if (isOdooId) {
        odooRes = await actualizarCotizacionEnOdoo({
          orderId: parseInt(editId),
          clientId,
          clientName,
          obra,
          items,
          totalNeto,
          isMonolitico: false
        });
      } else {
        odooRes = await guardarCotizacionEnOdoo({
          clientId,
          clientName,
          obra,
          budgetNumber: 0,
          items,
          totalNeto
        });
      }

      if (odooRes.exito) {
        if (isOdooId) {
          alert(`✅ ¡Listo! Cotización ${odooRes.cotizacionName} actualizada en Odoo. A continuación se descargarán los PDFs.`);
        } else {
          alert(`✅ ¡Listo! Orden de venta ${odooRes.cotizacionName} confirmada en Odoo con sus órdenes de fabricación. A continuación se descargarán los PDFs.`);
        }
        
        const finalBudgetName = odooRes.cotizacionName || 'Borrador';
        setBudgetName(finalBudgetName);

        await handleExportPDF(finalBudgetName);
        await handleExportWorkOrders(finalBudgetName);

        // Reset
        localStorage.removeItem('formas_cotizacion_draft');
        setClientName('');
        setObra('');
        setBudgetName('Borrador');
        setItems([]);

        if (isOdooId) {
          router.push('/cotizaciones');
        }
      } else {
        alert(`Error desde Odoo: ${odooRes.error}`);
      }
    } catch (error) {
      console.error(error);
      alert("Error de conexión con el servidor");
    } finally {
      setIsSyncingOdoo(false);
    }
  };

  const handleExportPDF = async (overrideName?: string) => {
    const finalName = overrideName || budgetName;
    const doc = new jsPDF();

    try {
      const res = await fetch('/logo.png');
      const blob = await res.blob();
      const logoBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      doc.addImage(logoBase64, 'PNG', 14, 10, 30, 30);
    } catch (e) {
      console.error("Error al cargar el logo en el PDF", e);
    }

    doc.setFontSize(20);
    doc.text("Presupuesto Termopaneles con Formas", 50, 25);

    doc.setFontSize(10);
    doc.text(`N° Presupuesto: ${finalName}`, 150, 22);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 150, 28);

    doc.setFontSize(12);
    doc.text("Información del Cliente", 14, 45);
    doc.setFontSize(10);
    doc.text(`Nombre: ${clientName}`, 14, 53);
    
    let currentY = 53;
    if (obra.trim()) {
      currentY += 8;
      doc.text(`Obra: ${obra.trim()}`, 14, currentY);
    }
    currentY += 8;
    const totalM2 = items.reduce((acc, item) => {
      const calc = calcularItem(item);
      return acc + calc.metrosCuadrados;
    }, 0);
    doc.text(`Total Metros Cuadrados: ${totalM2.toFixed(2)} m²`, 14, currentY);

    let yPos = currentY + 14;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, yPos - 5, 182, 8, 'F');
    doc.setFont("helvetica", "bold");
    doc.text("Ref", 16, yPos);
    doc.text("Cant.", 43, yPos);
    doc.text("Dim. (mm)", 57, yPos);
    doc.text("Configuración y Forma", 84, yPos);
    doc.text("Unitario", 152, yPos);
    doc.text("Total", 176, yPos);
    doc.setFont("helvetica", "normal");

    yPos += 10;

    items.forEach((item, index) => {
      const calculo = calcularItem(item);
      const labelVal = item.label || `V${index + 1}`;
      const splitLabel = doc.splitTextToSize(labelVal, 25);
      
      let shapeText = '';
      const med = item.medidasFigura || { a: 0, b: 0 };
      if (item.tipoFigura === 'triangulo') shapeText = `Triángulo: B:${med.a}, H:${med.b}`;
      if (item.tipoFigura === 'trapecio') shapeText = `Trapecio: W:${med.a}, H.Izq:${med.b1}, H.Der:${med.b2}`;
      if (item.tipoFigura === 'arco') shapeText = `Arco: W:${med.a}, H.Base:${med.b}`;
      if (item.tipoFigura === 'rectangulo') shapeText = `Rectángulo: W:${med.a}, H:${med.b}`;

      let configDesc = `C1: ${item.cristal1.tipo} ${item.cristal1.espesor}mm | C2: ${item.cristal2.tipo} ${item.cristal2.espesor}mm | Sep: ${item.separador.espesor}mm ${item.separador.color} | Forma: ${shapeText}`;
      const extrasList: string[] = [];
      if (item.pulido) extrasList.push("Pulido");
      if (item.micropersiana) extrasList.push("Micropersiana");
      if (item.palillaje) extrasList.push(`Palillaje (${item.palillajeColor || 'Blanco'}, ${item.palillajeHorizontales || 0} horizontales y ${item.palillajeVerticales || 0} verticales)`);
      if (extrasList.length > 0) {
        configDesc += ` | Extras: ${extrasList.join(", ")}`;
      }

      const splitConfig = doc.splitTextToSize(configDesc, 42); // Reducido de 66 a 42 para dar espacio al dibujo
      const lineCount = Math.max(splitLabel.length, splitConfig.length);
      const rowHeight = Math.max(20, (lineCount * 5) + 5);

      if (yPos + rowHeight > 275) {
        doc.addPage();
        yPos = 20;
      }

      doc.text(splitLabel, 16, yPos);
      doc.text(item.cantidad.toString(), 43, yPos);
      doc.text(`${item.ancho} x ${item.alto}`, 57, yPos);
      doc.text(splitConfig, 84, yPos);

      // Dibujar la forma geométrica en el PDF
      drawShapeInPdf(
        doc,
        item.tipoFigura || 'rectangulo',
        128,
        yPos - 3,
        20,
        14,
        item.medidasFigura || { a: item.ancho, b: item.alto }
      );

      doc.text(`$${item.precioUnitario.toLocaleString('es-CL')}`, 152, yPos);
      doc.text(`$${calculo.totalLinea.toLocaleString('es-CL')}`, 176, yPos);

      yPos += rowHeight;
    });

    doc.line(14, yPos, 196, yPos);
    yPos += 10;

    const iva = Math.round(totalNeto * 0.19);
    const totalConIva = totalNeto + iva;

    doc.setFont("helvetica", "bold");
    doc.text(`Total Neto: $${totalNeto.toLocaleString('es-CL')}`, 140, yPos);
    yPos += 6;
    doc.text(`IVA (19%): $${iva.toLocaleString('es-CL')}`, 140, yPos);
    yPos += 6;
    doc.setFontSize(11);
    doc.text(`Total: $${totalConIva.toLocaleString('es-CL')}`, 140, yPos);

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
      "PROWINDOWS LTDA. no responde por los daños de quiebres, rayaduras o picaduras en los cristales aportados por los clientes.",
      "Esperando este Presupuesto sea de su agrado le saluda atentamente:",
    ];

    notas.forEach((nota) => {
      yPos += 5.5;
      const splitNota = doc.splitTextToSize(nota, 182);
      doc.text(splitNota, 14, yPos);
      yPos += (splitNota.length - 1) * 4.5;
    });

    yPos += 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text("Firma de aceptación del Cliente: ___________________________", 14, yPos);
    doc.text("Modalidad de Pago: __________________", 120, yPos);

    const sanitizedClientName = clientName ? clientName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : 'Sin_Cliente';
    doc.save(`Cotizacion_CAD_${finalName}_${sanitizedClientName}.pdf`);
  };

  const handleExportWorkOrders = async (overrideName?: string) => {
    const finalName = overrideName || budgetName;
    if (items.length === 0) return;
    const pdf = new jsPDF();
    const totalM2 = items.reduce((acc, item) => {
      const calc = calcularItem(item);
      return acc + calc.metrosCuadrados;
    }, 0);

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

    // PAGE 1: CORTE VIDRIO
    if (logoBase64) pdf.addImage(logoBase64, 'PNG', 14, 10, 25, 25);
    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text("ORDEN DE TRABAJO", 45, 20);
    pdf.setFontSize(13);
    pdf.setTextColor(80, 80, 80);
    pdf.text("Taller Corte Vidrio (Formas)", 45, 28);
    pdf.setTextColor(0, 0, 0);

    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Ref: ${finalName}`, 155, 18);
    pdf.text(`Fecha: ${new Date().toLocaleDateString('es-CL')}`, 155, 24);
    pdf.text(`Cliente: ${clientName}`, 155, 30);
    let topHeaderOffset = 38;
    if (obra.trim()) {
      pdf.text(`Obra: ${obra.trim()}`, 155, 36);
      topHeaderOffset = 44;
    }

    pdf.setDrawColor(200, 200, 200);
    pdf.line(14, topHeaderOffset, 196, topHeaderOffset);

    let yPos = topHeaderOffset + 10;
    pdf.setFillColor(51, 65, 85);
    pdf.rect(14, yPos - 6, 182, 9, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("Ref", 17, yPos);
    pdf.text("Ancho (mm)", 36, yPos);
    pdf.text("Alto (mm)", 58, yPos);
    pdf.text("Cant.", 77, yPos);
    pdf.text("Cristal 1", 89, yPos);
    pdf.text("Cant.", 138, yPos);
    pdf.text("Cristal 2", 150, yPos);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont("helvetica", "normal");

    yPos += 8;

    items.forEach((item, index) => {
      const labelVal = item.label || `V${index + 1}`;
      const splitLabel = pdf.splitTextToSize(labelVal, 28);
      
      let extrasText = "Forma: ";
      const med = item.medidasFigura || { a: 0, b: 0 };
      if (item.tipoFigura === 'triangulo') extrasText += `Triángulo (Base:${med.a}, Alt:${med.b})`;
      if (item.tipoFigura === 'trapecio') extrasText += `Trapecio (Ancho:${med.a}, Alt.Izq:${med.b1}, Alt.Der:${med.b2})`;
      if (item.tipoFigura === 'arco') extrasText += `Arco (Ancho:${med.a}, Alt.Base:${med.b})`;
      if (item.tipoFigura === 'rectangulo') extrasText += `Rectángulo (Ancho:${med.a}, Alt:${med.b})`;

      const rowHeight = 24; // Aumentado de 14 a 24 para dar espacio a la figura

      if (yPos + rowHeight > 275) {
        pdf.addPage();
        yPos = 20;
        pdf.setFillColor(51, 65, 85);
        pdf.rect(14, yPos - 6, 182, 9, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.text("Ref", 17, yPos);
        pdf.text("Ancho (mm)", 36, yPos);
        pdf.text("Alto (mm)", 58, yPos);
        pdf.text("Cant.", 77, yPos);
        pdf.text("Cristal 1", 89, yPos);
        pdf.text("Cant.", 138, yPos);
        pdf.text("Cristal 2", 150, yPos);
        pdf.setTextColor(0, 0, 0);
        yPos += 8;
      }

      if (index % 2 === 0) {
        pdf.setFillColor(248, 250, 252);
        pdf.rect(14, yPos - 5, 182, rowHeight, 'F');
      }

      pdf.setFontSize(9);
      pdf.text(splitLabel, 17, yPos);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${item.ancho}`, 36, yPos);
      pdf.text(`${item.alto}`, 58, yPos);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${item.cantidad}`, 79, yPos);
      pdf.text(`${item.cristal1.tipo} ${item.cristal1.espesor}mm`, 89, yPos);
      pdf.text(`${item.cantidad}`, 140, yPos);
      pdf.text(`${item.cristal2.tipo} ${item.cristal2.espesor}mm`, 150, yPos);

      // Dibujar la forma en la derecha de la fila
      drawShapeInPdf(
        pdf,
        item.tipoFigura || 'rectangulo',
        172,
        yPos - 3,
        20,
        15,
        item.medidasFigura || { a: item.ancho, b: item.alto }
      );

      pdf.setFontSize(8);
      pdf.setTextColor(194, 65, 12); // Amber-700
      pdf.text(extrasText, 89, yPos + 6); // Desplazado a la izquierda
      pdf.setTextColor(0, 0, 0);

      yPos += rowHeight;
    });

    pdf.line(14, yPos, 196, yPos);
    yPos += 8;
    pdf.setFont("helvetica", "bold");
    pdf.text(`Total a cortar: ${totalM2.toFixed(2)} m²`, 14, yPos);
    
    // PAGE 2: TERMOPANELES
    pdf.addPage();
    if (logoBase64) pdf.addImage(logoBase64, 'PNG', 14, 10, 25, 25);
    pdf.setFontSize(18);
    pdf.text("ORDEN DE TRABAJO", 45, 20);
    pdf.setFontSize(13);
    pdf.setTextColor(80, 80, 80);
    pdf.text("Taller Termopaneles (Formas)", 45, 28);
    pdf.setTextColor(0, 0, 0);

    pdf.setFontSize(9);
    pdf.text(`Ref: ${finalName}`, 155, 18);
    pdf.text(`Fecha: ${new Date().toLocaleDateString('es-CL')}`, 155, 24);
    pdf.text(`Cliente: ${clientName}`, 155, 30);
    topHeaderOffset = 38;
    if (obra.trim()) {
      pdf.text(`Obra: ${obra.trim()}`, 155, 36);
      topHeaderOffset = 44;
    }

    pdf.line(14, topHeaderOffset, 196, topHeaderOffset);

    yPos = topHeaderOffset + 10;
    pdf.setFillColor(15, 118, 110);
    pdf.rect(14, yPos - 6, 182, 9, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.text("Ref", 17, yPos);
    pdf.text("Cant.", 38, yPos);
    pdf.text("Ancho", 48, yPos);
    pdf.text("Alto", 61, yPos);
    pdf.text("Cristal 1", 74, yPos);
    pdf.text("Cristal 2", 107, yPos);
    pdf.text("Sep.", 140, yPos);
    pdf.text("Color Sep.", 152, yPos);
    pdf.text("Dibujo", 174, yPos);
    pdf.setTextColor(0, 0, 0);

    yPos += 8;

    items.forEach((item, index) => {
      const labelVal = item.label || `V${index + 1}`;
      const splitLabel = pdf.splitTextToSize(labelVal, 28);
      
      let extrasText = "Forma: ";
      const med = item.medidasFigura || { a: 0, b: 0 };
      if (item.tipoFigura === 'triangulo') extrasText += `Triángulo (Base:${med.a}, Alt:${med.b})`;
      if (item.tipoFigura === 'trapecio') extrasText += `Trapecio (Ancho:${med.a}, Alt.Izq:${med.b1}, Alt.Der:${med.b2})`;
      if (item.tipoFigura === 'arco') extrasText += `Arco (Ancho:${med.a}, Alt.Base:${med.b})`;
      if (item.tipoFigura === 'rectangulo') extrasText += `Rectángulo (Ancho:${med.a}, Alt:${med.b})`;

      if (item.palillaje) {
        extrasText += ` | Palillaje (${item.palillajeColor}, ${item.palillajeHorizontales} horizontales y ${item.palillajeVerticales} verticales)`;
      }

      const rowHeight = 24; // Aumentado de 14 a 24 para dar espacio a la figura

      if (yPos + rowHeight > 275) {
        pdf.addPage();
        yPos = 20;
        pdf.setFillColor(15, 118, 110);
        pdf.rect(14, yPos - 6, 182, 9, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.text("Ref", 17, yPos);
        pdf.text("Cant.", 38, yPos);
        pdf.text("Ancho", 48, yPos);
        pdf.text("Alto", 61, yPos);
        pdf.text("Cristal 1", 74, yPos);
        pdf.text("Cristal 2", 107, yPos);
        pdf.text("Sep.", 140, yPos);
        pdf.text("Color Sep.", 152, yPos);
        pdf.text("Dibujo", 174, yPos);
        pdf.setTextColor(0, 0, 0);
        yPos += 8;
      }

      if (index % 2 === 0) {
        pdf.setFillColor(240, 253, 250);
        pdf.rect(14, yPos - 5, 182, rowHeight, 'F');
      }

      pdf.setFontSize(9);
      pdf.text(splitLabel, 17, yPos);
      pdf.text(`${item.cantidad}`, 38, yPos);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${item.ancho}`, 48, yPos);
      pdf.text(`${item.alto}`, 61, yPos);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${item.cristal1.tipo} ${item.cristal1.espesor}mm`, 74, yPos);
      pdf.text(`${item.cristal2.tipo} ${item.cristal2.espesor}mm`, 107, yPos);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${item.separador.espesor}`, 140, yPos);
      pdf.text(`${item.separador.color}`, 152, yPos);
      pdf.setFont("helvetica", "normal");

      // Dibujar la forma en la derecha de la fila
      drawShapeInPdf(
        pdf,
        item.tipoFigura || 'rectangulo',
        172,
        yPos - 3,
        20,
        15,
        item.medidasFigura || { a: item.ancho, b: item.alto }
      );

      pdf.setFontSize(8);
      pdf.setTextColor(13, 148, 136); // Teal-600
      pdf.text(extrasText, 74, yPos + 6); // Desplazado a la izquierda
      pdf.setTextColor(0, 0, 0);

      yPos += rowHeight;
    });

    pdf.line(14, yPos, 196, yPos);
    yPos += 8;
    pdf.setFont("helvetica", "bold");
    pdf.text(`Total a armar: ${totalM2.toFixed(2)} m²`, 14, yPos);

    const sanitizedClientName = clientName ? clientName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : 'Sin_Cliente';
    pdf.save(`Ordenes_Trabajo_CAD_${finalName}_${sanitizedClientName}.pdf`);
  };

  // SVG Scaled coordinates calculation
  const getSvgGeometry = () => {
    const wMax = 300;
    const hMax = 200;
    const xOffset = 50;
    const yOffset = 50;

    if (shape === 'rectangulo') {
      return {
        path: `M ${xOffset},${yOffset} L ${xOffset + wMax},${yOffset} L ${xOffset + wMax},${yOffset + hMax} L ${xOffset},${yOffset + hMax} Z`,
        points: [],
        lines: [
          { x1: xOffset, y1: yOffset + hMax + 20, x2: xOffset + wMax, y2: yOffset + hMax + 20, label: `A = ${medidaA} mm` },
          { x1: xOffset + wMax + 20, y1: yOffset, x2: xOffset + wMax + 20, y2: yOffset + hMax, label: `B = ${medidaB} mm` }
        ]
      };
    }
    if (shape === 'triangulo') {
      return {
        path: `M ${xOffset},${yOffset + hMax} L ${xOffset + wMax},${yOffset + hMax} L ${xOffset},${yOffset} Z`,
        points: [],
        lines: [
          { x1: xOffset, y1: yOffset + hMax + 20, x2: xOffset + wMax, y2: yOffset + hMax + 20, label: `A = ${medidaA} mm` },
          { x1: xOffset - 20, y1: yOffset, x2: xOffset - 20, y2: yOffset + hMax, label: `B = ${medidaB} mm` }
        ]
      };
    }
    if (shape === 'trapecio') {
      const maxH = Math.max(medidaB1, medidaB2) || 1;
      const hLeft = (medidaB1 / maxH) * hMax;
      const hRight = (medidaB2 / maxH) * hMax;
      
      const yLeft = yOffset + hMax - hLeft;
      const yRight = yOffset + hMax - hRight;
      
      return {
        path: `M ${xOffset},${yOffset + hMax} L ${xOffset + wMax},${yOffset + hMax} L ${xOffset + wMax},${yRight} L ${xOffset},${yLeft} Z`,
        points: [],
        lines: [
          { x1: xOffset, y1: yOffset + hMax + 20, x2: xOffset + wMax, y2: yOffset + hMax + 20, label: `A = ${medidaA} mm` },
          { x1: xOffset - 20, y1: yLeft, x2: xOffset - 20, y2: yOffset + hMax, label: `B1 = ${medidaB1} mm` },
          { x1: xOffset + wMax + 20, y1: yRight, x2: xOffset + wMax + 20, y2: yOffset + hMax, label: `B2 = ${medidaB2} mm` }
        ]
      };
    }
    if (shape === 'arco') {
      const maxH = (medidaB + medidaA / 2) || 1;
      const hBaseScaled = (medidaB / maxH) * hMax;
      const rScaled = ((medidaA / 2) / maxH) * wMax; // Center aspect ratio

      const yBottom = yOffset + hMax;
      const yBaseTop = yBottom - hBaseScaled;
      
      const wScaled = (medidaA / maxH) * wMax * 0.75;
      const xStart = 200 - wScaled / 2;
      const xEnd = 200 + wScaled / 2;
      const r = wScaled / 2;
      const yArchTop = yBaseTop - r;

      return {
        path: `M ${xStart},${yBottom} L ${xEnd},${yBottom} L ${xEnd},${yBaseTop} A ${r},${r} 0 0,0 ${xStart},${yBaseTop} Z`,
        points: [],
        lines: [
          { x1: xStart, y1: yBottom + 20, x2: xEnd, y2: yBottom + 20, label: `A = ${medidaA} mm` },
          { x1: xStart - 20, y1: yBaseTop, x2: xStart - 20, y2: yBottom, label: `B = ${medidaB} mm` },
          { x1: 200, y1: yArchTop, x2: 200, y2: yBaseTop, label: `R = ${medidaA / 2} mm` }
        ]
      };
    }

    return { path: '', points: [], lines: [] };
  };

  const svgData = getSvgGeometry();

  if (isLoadingConfig) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 bg-slate-50 min-h-screen font-sans">
      <header className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3">
          <a href="/" className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-lg transition-colors">
            <ArrowLeft size={16} />
          </a>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Triangle className="text-amber-500 fill-amber-500/20" size={24} /> Cotizador de Formas
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">Diseña figuras geométricas y cotiza en base a dimensiones reales</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {sessionName && (
            <span className="text-xs text-slate-400 mr-2 hidden sm:inline">{sessionName}</span>
          )}
          <button
            onClick={() => handleExportPDF()}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            disabled={items.length === 0}
            title="Imprimir Presupuesto Comercial en PDF"
          >
            <Printer size={16} />
            Presupuesto PDF
          </button>
          <button
            onClick={() => handleExportWorkOrders()}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            disabled={items.length === 0}
            title="Imprimir Órdenes de Trabajo en PDF"
          >
            <Printer size={16} />
            Taller PDF
          </button>
          <button
            onClick={handleProcessQuote}
            className={`flex items-center gap-2 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none transform active:scale-95 ${
              editId && /^\d+$/.test(editId)
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
                : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700'
            }`}
            disabled={isSyncingOdoo || items.length === 0}
          >
            <Cloud size={16} className={isSyncingOdoo ? 'animate-spin' : ''} />
            {isSyncingOdoo
              ? 'Guardando en Odoo...'
              : editId && /^\d+$/.test(editId)
                ? `Actualizar ${budgetName} (Odoo + PDFs)`
                : 'Procesar Todo (Odoo + PDFs)'}
          </button>
        </div>
      </header>

      {showDraftBanner && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm animate-fade-in">
          <div className="flex gap-2.5">
            <span className="text-amber-500 font-bold text-lg">⚠️</span>
            <div>
              <h3 className="font-semibold text-amber-800 text-sm">Se encontró una cotización sin guardar</h3>
              <p className="text-xs text-amber-700 mt-0.5">Guardada automáticamente el {draftTime}. ¿Deseas recuperarla?</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleRestoreDraft}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
            >
              Recuperar Borrador
            </button>
            <button
              onClick={handleDiscardDraft}
              className="bg-transparent hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      {/* Cliente y Obra */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Nombre Cliente</label>
            <ClientSelector
              value={clientName}
              clientId={clientId}
              onChange={(name, id) => {
                setClientName(name);
                setClientId(id);
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Obra (Opcional)</label>
            <input
              type="text"
              value={obra}
              onChange={(e) => setObra(e.target.value)}
              placeholder="Nombre de la obra, dirección, etc."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CONFIGURADOR (COL 5) */}
        <div className="lg:col-span-5 bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-6">
          
          {/* SELECCIÓN DE FIGURA */}
          <div>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">1. Seleccionar Figura</h2>
            <div className="grid grid-cols-4 gap-2">
              {(['rectangulo', 'triangulo', 'trapecio', 'arco'] as ShapeType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setShape(t)}
                  className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-semibold uppercase ${
                    shape === t
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-600'
                      : 'border-slate-200 hover:border-slate-300 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <svg className="w-10 h-10" viewBox="0 0 100 100">
                    {t === 'rectangulo' && <rect x="20" y="25" width="60" height="50" fill="none" stroke="currentColor" strokeWidth="6" rx="4" />}
                    {t === 'triangulo' && <polygon points="20,80 80,80 20,20" fill="none" stroke="currentColor" strokeWidth="6" />}
                    {t === 'trapecio' && <polygon points="15,80 85,80 75,35 15,20" fill="none" stroke="currentColor" strokeWidth="6" />}
                    {t === 'arco' && <path d="M 20,80 L 80,80 L 80,50 A 30,30 0 0,0 20,50 Z" fill="none" stroke="currentColor" strokeWidth="6" />}
                  </svg>
                  <span>{t}</span>
                </button>
              ))}
            </div>
          </div>

          {/* DIMS EN MILÍMETROS */}
          <div>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">2. Dimensiones (mm)</h2>
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              
              {shape !== 'trapecio' ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Ancho / Base (A)</label>
                    <input
                      type="number"
                      value={medidaA || ''}
                      onChange={(e) => setMedidaA(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Altura (B)</label>
                    <input
                      type="number"
                      value={medidaB || ''}
                      onChange={(e) => setMedidaB(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 mb-1">Ancho Base (A)</label>
                    <input
                      type="number"
                      value={medidaA || ''}
                      onChange={(e) => setMedidaA(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Altura Izquierda (B1)</label>
                    <input
                      type="number"
                      value={medidaB1 || ''}
                      onChange={(e) => setMedidaB1(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Altura Derecha (B2)</label>
                    <input
                      type="number"
                      value={medidaB2 || ''}
                      onChange={(e) => setMedidaB2(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* CRISTALES & SEPARADOR */}
          <div>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">3. Configuración Vidrio</h2>
            <div className="grid grid-cols-2 gap-4">
              
              {/* Cristal 1 */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Cristal 1 (Ext)</label>
                <select
                  value={cristal1Tipo}
                  onChange={(e) => setCristal1Tipo(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-transparent outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium"
                >
                  {tiposUnicos.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Espesor C1</label>
                <select
                  value={cristal1Espesor}
                  onChange={(e) => setCristal1Espesor(parseInt(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-transparent outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-center"
                >
                  {getEspesores(cristal1Tipo).map(t => <option key={t} value={t}>{t} mm</option>)}
                </select>
              </div>

              {/* Cristal 2 */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Cristal 2 (Int)</label>
                <select
                  value={cristal2Tipo}
                  onChange={(e) => setCristal2Tipo(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-transparent outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium"
                >
                  {tiposUnicos.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Espesor C2</label>
                <select
                  value={cristal2Espesor}
                  onChange={(e) => setCristal2Espesor(parseInt(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-transparent outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-center"
                >
                  {getEspesores(cristal2Tipo).map(t => <option key={t} value={t}>{t} mm</option>)}
                </select>
              </div>

              {/* Separador */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Espesor Sep.</label>
                <select
                  value={separadorEspesor}
                  onChange={(e) => setSeparadorEspesor(parseInt(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-transparent outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-center"
                >
                  {config?.separadores.map(s => <option key={s} value={s}>{s} mm</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Color Sep.</label>
                <select
                  value={separadorColor}
                  onChange={(e) => setSeparadorColor(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-transparent outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                >
                  {config?.coloresSeparador.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

            </div>
          </div>

          {/* EXTRAS */}
          <div>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">4. Extras</h2>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
              <div className="flex justify-around items-center">
                <label className="flex items-center gap-1.5 cursor-pointer text-sm font-medium text-slate-700 select-none">
                  <input type="checkbox" checked={pulido} onChange={e => setPulido(e.target.checked)} className="accent-cyan-500 w-4 h-4" />
                  Pulido (Pu)
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-sm font-medium text-slate-700 select-none">
                  <input type="checkbox" checked={micropersiana} onChange={e => setMicropersiana(e.target.checked)} className="accent-cyan-500 w-4 h-4" />
                  Micropersiana (M)
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-sm font-medium text-slate-700 select-none">
                  <input type="checkbox" checked={palillaje} onChange={e => setPalillaje(e.target.checked)} className="accent-cyan-500 w-4 h-4" />
                  Palillaje (P)
                </label>
              </div>

              {palillaje && (
                <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-500">Color de Palillaje:</span>
                    <select
                      value={palillajeColor}
                      onChange={(e) => setPalillajeColor(e.target.value)}
                      className="bg-transparent border border-slate-200 rounded px-2 py-1 outline-none text-slate-700 text-xs"
                    >
                      <option value="Blanco">Blanco</option>
                      <option value="Negro">Negro</option>
                      <option value="Marron">Marrón</option>
                      <option value="Toffe">Toffe</option>
                    </select>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex items-center flex-1 justify-between">
                      <span className="font-semibold text-slate-500 mr-2">Horizontales:</span>
                      <input
                        type="number"
                        min="0"
                        value={palillajeHorizontales}
                        onChange={(e) => setPalillajeHorizontales(parseInt(e.target.value) || 0)}
                        className="border border-slate-200 rounded w-12 py-1 text-center font-bold outline-none"
                      />
                    </div>
                    <div className="flex items-center flex-1 justify-between">
                      <span className="font-semibold text-slate-500 mr-2">Verticales:</span>
                      <input
                        type="number"
                        min="0"
                        value={palillajeVerticales}
                        onChange={(e) => setPalillajeVerticales(parseInt(e.target.value) || 0)}
                        className="border border-slate-200 rounded w-12 py-1 text-center font-bold outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* DESCUENTO Y CANTIDAD */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Descuento (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={descuento || ''}
                onChange={(e) => setDescuento(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Cantidad</label>
              <input
                type="number"
                min="1"
                value={cantidad}
                onChange={(e) => setCantidad(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold"
              />
            </div>
          </div>

          <button
            onClick={handleAddItem}
            className="w-full bg-slate-800 hover:bg-slate-900 text-white py-3 rounded-xl font-bold transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            <Plus size={18} /> Agregar al Presupuesto
          </button>

        </div>

        {/* CANVA CAD VISUALIZADOR (COL 7) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* LIENZO CAD */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative p-4 flex flex-col items-center">
            
            {/* Tag CAD */}
            <div className="absolute top-4 left-4 bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 font-mono text-[10px] tracking-wider uppercase px-2.5 py-1 rounded-md shadow">
              visualizador cad v1.0
            </div>

            {/* Grid CAD SVG */}
            <svg
              className="w-full max-w-[420px] aspect-[4/3] bg-slate-900/40 rounded-xl border border-slate-800/80 mt-8 relative"
              viewBox="0 0 400 300"
            >
              <defs>
                <pattern id="cadGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(6, 182, 212, 0.05)" strokeWidth="1" />
                </pattern>
                <marker id="arrowCAD" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#f97316" />
                </marker>
              </defs>
              
              {/* background grid */}
              <rect width="400" height="300" fill="url(#cadGrid)" />

              {/* Dynamic Path */}
              {svgData.path && (
                <path
                  d={svgData.path}
                  fill="rgba(6, 182, 212, 0.04)"
                  stroke="#06b6d4"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]"
                />
              )}

              {/* Dimension indicators */}
              {svgData.lines?.map((line, idx) => (
                <g key={idx}>
                  <line
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke="#f97316"
                    strokeWidth="1.5"
                    markerStart="url(#arrowCAD)"
                    markerEnd="url(#arrowCAD)"
                  />
                  {/* Text labels */}
                  <text
                    x={(line.x1 + line.x2) / 2}
                    y={line.y1 === line.y2 ? line.y1 - 6 : (line.y1 + line.y2) / 2 + 4}
                    textAnchor="middle"
                    fill="#f97316"
                    className="font-mono text-[10px] font-bold"
                  >
                    {line.label}
                  </text>
                </g>
              ))}
            </svg>

            {/* Cad status info */}
            <div className="w-full flex justify-between text-[11px] font-mono text-slate-500 mt-4 px-2">
              <span>Status: Ready</span>
              <span>Units: Milimeters (mm)</span>
            </div>

          </div>

          {/* RESUMEN DE CÁLCULO EN DIRECTO */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Resumen de Cálculo (Fórmulas Reales)</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg">
                <span className="text-slate-400 block mb-0.5">Área Real</span>
                <strong className="text-slate-700 text-sm">{getCalculatedArea().toFixed(3)} m²</strong>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg">
                <span className="text-slate-400 block mb-0.5">Perímetro Real</span>
                <strong className="text-slate-700 text-sm">{getCalculatedPerimeter().toFixed(3)} ml</strong>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg">
                <span className="text-slate-400 block mb-0.5">Recargo Forma</span>
                <strong className="text-amber-600 text-sm font-bold">+{params.recargoPorcentajeForma || 50}%</strong>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg col-span-2 md:col-span-1">
                <span className="text-slate-400 block mb-0.5">Precio Unitario Sugerido</span>
                <strong className="text-cyan-700 text-sm">${computedUnitPrice.toLocaleString('es-CL')} CLP</strong>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg col-span-2">
                <span className="text-slate-400 block mb-0.5">Total Línea (con Cantidad)</span>
                <strong className="text-slate-800 text-base font-bold">${computedTotalLine.toLocaleString('es-CL')} CLP</strong>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* DETALLE DEL PRESUPUESTO ACTUAL (TABLA DE ABAJO) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 mt-6 overflow-hidden">
        <div className="p-4 bg-slate-100 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Líneas de Presupuesto</h2>
        </div>
        {items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No hay figuras agregadas al presupuesto actual. Diseñe una arriba y haga clic en "Agregar al Presupuesto".</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider text-center">
                <tr>
                  <th className="p-3 text-left w-12">Pos</th>
                  <th className="p-3 w-24">Figura</th>
                  <th className="p-3 w-16">Cant.</th>
                  <th className="p-3 w-28">Dim. Bounding (mm)</th>
                  <th className="p-3">Configuración de Vidrio</th>
                  <th className="p-3 w-20">Desc (%)</th>
                  <th className="p-3 w-28 text-right">P. Unitario</th>
                  <th className="p-3 w-28 text-right">Total</th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                {items.map((item, idx) => {
                  const calc = calcularItem(item);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-semibold text-slate-500">{item.label || `V${idx + 1}`}</td>
                      <td className="p-3 text-center uppercase font-bold text-cyan-600">{item.tipoFigura}</td>
                      <td className="p-3 text-center font-semibold">{item.cantidad}</td>
                      <td className="p-3 text-center font-mono">{item.ancho} x {item.alto}</td>
                      <td className="p-3">
                        <div className="space-y-0.5">
                          <div>
                            <strong>C1:</strong> {item.cristal1.tipo} {item.cristal1.espesor}mm | <strong>C2:</strong> {item.cristal2.tipo} {item.cristal2.espesor}mm | <strong>Sep:</strong> {item.separador.espesor}mm {item.separador.color}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {item.pulido && <span className="bg-slate-100 px-1 py-0.5 rounded mr-1">Pulido</span>}
                            {item.micropersiana && <span className="bg-slate-100 px-1 py-0.5 rounded mr-1">Micropersiana</span>}
                            {item.palillaje && <span className="bg-slate-100 px-1 py-0.5 rounded mr-1">Palillaje ({item.palillajeColor}, {item.palillajeHorizontales} horizontales y {item.palillajeVerticales} verticales)</span>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-center">{item.descuento || 0}%</td>
                      <td className="p-3 text-right font-mono font-medium">${item.precioUnitario.toLocaleString('es-CL')}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-800">${calc.totalLinea.toLocaleString('es-CL')}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-slate-300 hover:text-red-500 transition-colors p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-50 font-bold text-sm text-slate-800">
                  <td colSpan={6} className="p-3 text-right">Subtotal Neto:</td>
                  <td colSpan={2} className="p-3 text-right font-mono text-base text-slate-900">${totalNeto.toLocaleString('es-CL')}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

export default function ShapesCADCotizador() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-slate-50">Cargando...</div>}>
      <ShapesCADCotizadorContent />
    </Suspense>
  )
}
