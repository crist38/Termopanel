"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { TermopanelItem, calcularItem, calcularTotal, calcularPrecioUnitario, PARAMETROS_DEFAULT } from "@/lib/calculos/termopanel"
import { PRECIOS_VIDRIOS, Vidrio, TIPOS_UNICOS as STATIC_TIPOS_UNICOS } from "@/lib/data/vidrios"
import { collection, getDocs, query, orderBy, limit, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getTermopanelConfig, TermopanelConfig, getPrecioSeparadorPorMl, PRECIOS_SEPARADORES_DEFAULT } from '@/lib/configService';
import { useSearchParams, useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
import { Printer, Plus, Trash2, Cloud, ClipboardList, LogOut, BarChart2, Triangle } from 'lucide-react';
import { guardarCotizacionEnOdoo } from '@/app/actions/odoo';
import { logoutFromOdoo } from '@/app/actions/auth';
import { ClientSelector } from '@/components/ClientSelector';


function CotizadorTermopanelContent() {
  const [config, setConfig] = useState<TermopanelConfig | null>(null);
  const [tiposUnicos, setTiposUnicos] = useState<string[]>(STATIC_TIPOS_UNICOS);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [items, setItems] = useState<TermopanelItem[]>([
    {
      id: "1",
      label: "V1",
      cantidad: 1,
      ancho: 1000,
      alto: 1000,
      cristal1: { tipo: "Incoloro", espesor: 4 },
      cristal2: { tipo: "Incoloro", espesor: 4 },
      separador: { espesor: 10, color: "Mate" },
      pulido: false,
      micropersiana: false,
      palillaje: false,
      palillajeColor: "Blanco",
      palillajeHorizontales: 0,
      palillajeVerticales: 0,
      conForma: false,
      descuento: 0,
      precioUnitario: 0
    }
  ])

  // Estado para Información del Cliente y Presupuesto
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

  // Cargar configuración de precios
  useEffect(() => {
    const fetchConfig = async () => {
      setIsLoadingConfig(true);
      const conf = await getTermopanelConfig();
      setConfig(conf);
      setTiposUnicos(Array.from(new Set(conf.vidrios.map(v => v.tipo))));
      setIsLoadingConfig(false);
    };
    fetchConfig();
  }, []);

  // Recalcular precios de todos los items cuando la config carga
  // (necesario para items ya cargados o editados antes de que config termine)
  useEffect(() => {
    if (!config) return;
    setItems(prev => prev.map(item => {
      if (item.ancho <= 0 || item.alto <= 0) return item;
      const p1 = config.vidrios.find(v => v.tipo === item.cristal1.tipo && v.espesor === item.cristal1.espesor)?.precio ?? 0;
      const p2 = config.vidrios.find(v => v.tipo === item.cristal2.tipo && v.espesor === item.cristal2.espesor)?.precio ?? 0;
      const seps = config.preciosSeparadores?.length ? config.preciosSeparadores : PRECIOS_SEPARADORES_DEFAULT;
      const precioSep = getPrecioSeparadorPorMl(seps, item.separador.color, item.separador.espesor);
      const params = { ...PARAMETROS_DEFAULT, ...(config.parametrosCalculo ?? {}) };
      return { ...item, precioUnitario: calcularPrecioUnitario(item, p1, p2, precioSep, params) };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // Cargar presupuesto para editar
  useEffect(() => {
    if (!editId) return;

    const loadBudget = async () => {
      try {
        const docRef = doc(db, 'presupuestos_termopaneles', editId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setClientName(data.clientName || '');
          setObra(data.obra || '');
          setBudgetName(data.budgetName || data.budgetNumber?.toString() || 'Borrador');
          const loadedItems = (data.items || []).map((item: any) => ({
            ...item,
            pulido: item.pulido !== undefined ? item.pulido : (item.gas || false),
            palillajeColor: item.palillajeColor || "Blanco",
            palillajeHorizontales: item.palillajeHorizontales || 0,
            palillajeVerticales: item.palillajeVerticales || 0,
            conForma: item.conForma || false
          }));
          setItems(loadedItems);
        }
      } catch (e) {
        console.error("Error loading budget:", e);
        alert("Error cargando presupuesto para editar.");
      }
    };
    loadBudget();
  }, [editId]);

  // Inicializar número de presupuesto (si no se está editando)
  useEffect(() => {
    if (editId) return;
    const today = new Date();
    setBudgetDate(today.toLocaleDateString('es-ES'));

    // Leer nombre del usuario desde la cookie de sesión
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

  // Detectar borrador guardado en localStorage al montar el componente
  useEffect(() => {
    if (editId) return;

    const savedDraft = localStorage.getItem('termopanel_cotizacion_draft');
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        const hasData = parsed.clientName || parsed.obra || parsed.items?.some((i: any) => i.ancho > 0 || i.alto > 0 || i.cantidad > 1);
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
    const hasAnyContent = clientName.trim() !== '' || obra.trim() !== '' || items.some(i => i.ancho > 0 || i.alto > 0 || i.cantidad > 1);
    if (!hasAnyContent) {
      localStorage.removeItem('termopanel_cotizacion_draft');
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
      localStorage.setItem('termopanel_cotizacion_draft', JSON.stringify(draft));
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
    localStorage.removeItem('termopanel_cotizacion_draft');
    setShowDraftBanner(false);
    setDraftData(null);
  };


  function getEspesores(tipo: string) {
    if (!config) return [];
    return config.vidrios.filter(v => v.tipo === tipo).map(v => v.espesor).sort((a, b) => a - b)
  }

  function getPrecioVidrio(tipo: string, espesor: number) {
    if (!config) return 0;
    return config.vidrios.find(v => v.tipo === tipo && v.espesor === espesor)?.precio || 0
  }

  function updateItem(id: string, field: keyof TermopanelItem | string, value: any) {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item

      let updatedItem = { ...item }

      // Manejo de objetos anidados (cristal1.tipo, etc)
    if (typeof field === 'string' && field.includes('.')) {
      const [parent, child] = field.split('.')
        // @ts-ignore
        updatedItem = {
          ...item,
          // @ts-ignore
          [parent]: { ...item[parent], [child]: value }
        }

        // Si cambia el tipo, resetear espesor al primero disponible si el actual no existe
        if (child === 'tipo') {
          // @ts-ignore
          const nuevoTipo = value
          // @ts-ignore
          const espesores = getEspesores(nuevoTipo)
          // @ts-ignore
          if (!espesores.includes(updatedItem[parent].espesor)) {
            // @ts-ignore
            updatedItem[parent].espesor = espesores[0]
          }
        }

      } else {
        // @ts-ignore
        updatedItem[field] = value
      }

      // Calcular precio sugerido con la fórmula completa del Excel
      const p1 = getPrecioVidrio(updatedItem.cristal1.tipo, updatedItem.cristal1.espesor)
      const p2 = getPrecioVidrio(updatedItem.cristal2.tipo, updatedItem.cristal2.espesor)
      // Usar siempre PRECIOS_SEPARADORES_DEFAULT como fallback garantizado
      const seps = config?.preciosSeparadores?.length
        ? config.preciosSeparadores
        : PRECIOS_SEPARADORES_DEFAULT
      const precioSep = getPrecioSeparadorPorMl(
        seps,
        updatedItem.separador.color,
        updatedItem.separador.espesor
      )

      updatedItem.precioUnitario = calcularPrecioUnitario(
        updatedItem,
        p1,
        p2,
        precioSep,
        config?.parametrosCalculo
      )

      return updatedItem
    }))
  }

  function addItem() {
    const defaultTipo = "Incoloro"
    const defaultEspesor = 4

    let nextNum = 1;
    const numbers = items
      .map(item => {
        const match = (item.label || '').match(/^V(\d+)$/i);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((n): n is number => n !== null);
    if (numbers.length > 0) {
      nextNum = Math.max(...numbers) + 1;
    } else {
      nextNum = items.length + 1;
    }
    const defaultLabel = `V${nextNum}`;

    const newItem: TermopanelItem = {
      id: crypto.randomUUID(),
      label: defaultLabel,
      cantidad: 1,
      ancho: 0,
      alto: 0,
      cristal1: { tipo: defaultTipo, espesor: defaultEspesor },
      cristal2: { tipo: defaultTipo, espesor: defaultEspesor },
      separador: { espesor: 10, color: "Mate" },
      pulido: false,
      micropersiana: false,
      palillaje: false,
      palillajeColor: "Blanco",
      palillajeHorizontales: 0,
      palillajeVerticales: 0,
      conForma: false,
      descuento: 0,
      precioUnitario: 0
    }
    setItems([...items, newItem])
  }

  function removeItem(id: string) {
    if (items.length === 1) return
    setItems(items.filter(i => i.id !== id))
  }

  const totalNeto = calcularTotal(items)
  const totalM2 = items.reduce((acc, item) => acc + ((item.ancho * item.alto) / 1000000) * item.cantidad, 0);



  const handleProcessQuote = async () => {
    if (!clientName) {
      alert("Por favor ingrese el nombre del cliente para procesar la cotización");
      return;
    }
    setIsSyncingOdoo(true);
    try {
      const odooRes = await guardarCotizacionEnOdoo({
        clientId,
        clientName,
        budgetNumber: 0,
        items,
        totalNeto
      });

      if (odooRes.exito) {
        alert(`✅ ¡Listo! Orden de venta ${odooRes.cotizacionName} confirmada en Odoo con sus órdenes de fabricación. A continuación se descargarán los PDFs.`);
        
        const finalBudgetName = odooRes.cotizacionName || 'Borrador';
        setBudgetName(finalBudgetName);

        // Generar PDFs de Presupuesto y Órdenes de Trabajo de forma secuencial
        await handleExportPDF(finalBudgetName);
        await handleExportWorkOrders(finalBudgetName);

        // Limpiar formulario para la siguiente cotización
        localStorage.removeItem('termopanel_cotizacion_draft');
        setClientName('');
        setObra('');
        setBudgetName('Borrador');
        setItems([
          {
            id: crypto.randomUUID(),
            label: "V1",
            cantidad: 1,
            ancho: 0,
            alto: 0,
            cristal1: { tipo: "Incoloro", espesor: 4 },
            cristal2: { tipo: "Incoloro", espesor: 4 },
            separador: { espesor: 10, color: "Mate" },
            pulido: false,
            micropersiana: false,
            palillaje: false,
            palillajeColor: "Blanco",
            palillajeHorizontales: 0,
            palillajeVerticales: 0,
            conForma: false,
            descuento: 0,
            precioUnitario: 0
          }
        ]);
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

    // Encabezado
    doc.setFontSize(20);
    doc.text("Presupuesto Termopaneles", 50, 25);

    doc.setFontSize(10);
    doc.text(`N° Presupuesto: ${finalName}`, 150, 22);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 150, 28);

    // Información del Cliente
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
    const totalM2 = items.reduce((acc, item) => acc + ((item.ancho * item.alto) / 1000000) * item.cantidad, 0);
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

    items.forEach((item, index) => {
      const calculo = calcularItem(item);
      const labelVal = item.label || `V${index + 1}`;
      const splitLabel = doc.splitTextToSize(labelVal, 25);
      let configDesc = `C1: ${item.cristal1.tipo} ${item.cristal1.espesor}mm | C2: ${item.cristal2.tipo} ${item.cristal2.espesor}mm | Sep: ${item.separador.espesor}mm ${item.separador.color}`;
      const extrasList: string[] = [];
      if (item.pulido) extrasList.push("Pulido");
      if (item.micropersiana) extrasList.push("Micropersiana");
      if (item.palillaje) {
        extrasList.push(`Palillaje (${item.palillajeColor || 'Blanco'}, ${item.palillajeHorizontales || 0} horizontales y ${item.palillajeVerticales || 0} verticales)`);
      }
      if (item.conForma) extrasList.push("Con Forma");
      if (extrasList.length > 0) {
        configDesc += ` | Extras: ${extrasList.join(", ")}`;
      }
      const splitConfig = doc.splitTextToSize(configDesc, 66);

      const lineCount = Math.max(splitLabel.length, splitConfig.length);

      // Verificar salto de página
      if (yPos + (lineCount * 5) > 275) {
        doc.addPage();
        yPos = 20;
      }

      doc.text(splitLabel, 16, yPos);
      doc.text(item.cantidad.toString(), 43, yPos);
      doc.text(`${item.ancho} x ${item.alto}`, 57, yPos);
      doc.text(splitConfig, 84, yPos);
      doc.text(`$${item.precioUnitario.toLocaleString('es-CL')}`, 152, yPos);
      doc.text(`$${calculo.totalLinea.toLocaleString('es-CL')}`, 176, yPos);

      yPos += (lineCount * 5) + 5;
    });

    // Total
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



    // Verificar si hay espacio suficiente para las notas y firmas en la página actual (necesitamos al menos 70mm libres)
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

    // Firma de aceptación del Cliente
    doc.text("Firma de aceptación del Cliente: ___________________________", 14, yPos);

    // Modalidad de Pago
    doc.text("Modalidad de Pago: __________________", 120, yPos);

    const sanitizedClientName = clientName ? clientName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : 'Sin_Cliente';
    doc.save(`Cotizacion_${finalName}_${sanitizedClientName}.pdf`);
  };

  const handleExportWorkOrders = async (overrideName?: string) => {
    const finalName = overrideName || budgetName;
    if (items.length === 0) return;
    const pdf = new jsPDF();
    const totalM2 = items.reduce((acc, item) => acc + ((item.ancho * item.alto) / 1000000) * item.cantidad, 0);

    // Cargar logo
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

    // ======================================================
    // PÁGINA 1: TALLER CORTE VIDRIO
    // ======================================================
    if (logoBase64) pdf.addImage(logoBase64, 'PNG', 14, 10, 25, 25);

    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text("ORDEN DE TRABAJO", 45, 20);
    pdf.setFontSize(13);
    pdf.setTextColor(80, 80, 80);
    pdf.text("Taller Corte Vidrio", 45, 28);
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

    // Línea separadora
    pdf.setDrawColor(200, 200, 200);
    pdf.line(14, topHeaderOffset, 196, topHeaderOffset);

    // Encabezado tabla Corte Vidrio
    let yPos = topHeaderOffset + 10;
    pdf.setFillColor(51, 65, 85); // slate-700
    pdf.rect(14, yPos - 6, 182, 9, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("Ref", 17, yPos);
    pdf.text("Cant.", 47, yPos);
    pdf.text("Ancho (mm)", 60, yPos);
    pdf.text("Alto (mm)", 85, yPos);
    pdf.text("Cristal 1", 110, yPos);
    pdf.text("Cristal 2", 152, yPos);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont("helvetica", "normal");

    yPos += 8;

    items.forEach((item, index) => {
      const labelVal = item.label || `V${index + 1}`;
      const splitLabel = pdf.splitTextToSize(labelVal, 28);
      
      let extrasText = "";
      const extrasParts = [];
      if (item.pulido) extrasParts.push("Pulido");
      if (item.micropersiana) extrasParts.push("Micropersiana");
      if (item.palillaje) extrasParts.push(`Palillaje (${item.palillajeColor || 'Blanco'}, ${item.palillajeHorizontales || 0} horizontales y ${item.palillajeVerticales || 0} verticales)`);
      if (item.conForma) extrasParts.push("Con Forma");
      if (extrasParts.length > 0) {
        extrasText = `Extras: ${extrasParts.join(", ")}`;
      }

      const rowHeight = extrasText ? 14 : Math.max(8, (splitLabel.length * 4) + 4);

      if (yPos + rowHeight > 275) {
        pdf.addPage();
        yPos = 20;
        // Repetir encabezado
        pdf.setFillColor(51, 65, 85);
        pdf.rect(14, yPos - 6, 182, 9, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.text("Ref", 17, yPos);
        pdf.text("Cant.", 47, yPos);
        pdf.text("Ancho (mm)", 60, yPos);
        pdf.text("Alto (mm)", 85, yPos);
        pdf.text("Cristal 1", 110, yPos);
        pdf.text("Cristal 2", 152, yPos);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont("helvetica", "normal");
        yPos += 8;
      }

      // Fila alternada
      if (index % 2 === 0) {
        pdf.setFillColor(248, 250, 252); // slate-50
        pdf.rect(14, yPos - 5, 182, rowHeight, 'F');
      }

      pdf.setFontSize(9);
      pdf.text(splitLabel, 17, yPos);
      pdf.text(`${item.cantidad}`, 47, yPos);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${item.ancho}`, 60, yPos);
      pdf.text(`${item.alto}`, 85, yPos);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${item.cristal1.tipo} ${item.cristal1.espesor}mm`, 110, yPos);
      pdf.text(`${item.cristal2.tipo} ${item.cristal2.espesor}mm`, 152, yPos);

      if (extrasText) {
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(extrasText, 110, yPos + 4.5);
        pdf.setTextColor(0, 0, 0);
      }

      yPos += rowHeight;
    });

    // Línea de cierre
    pdf.setDrawColor(200, 200, 200);
    pdf.line(14, yPos, 196, yPos);

    yPos += 8;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(0, 0, 0);
    pdf.text(`Total a cortar: ${(totalM2).toFixed(2)} m²`, 14, yPos);

    // Nota al pie
    yPos += 8;
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(120, 120, 120);
    pdf.text("* Las medidas de los cristales corresponden al termopanel completo. Ajustar descuentos según separador.", 14, yPos);


    // ======================================================
    // PÁGINA 2: TALLER TERMOPANELES
    // ======================================================
    pdf.addPage();

    if (logoBase64) pdf.addImage(logoBase64, 'PNG', 14, 10, 25, 25);

    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(0, 0, 0);
    pdf.text("ORDEN DE TRABAJO", 45, 20);
    pdf.setFontSize(13);
    pdf.setTextColor(80, 80, 80);
    pdf.text("Taller Termopaneles", 45, 28);
    pdf.setTextColor(0, 0, 0);

    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Ref: ${finalName}`, 155, 18);
    pdf.text(`Fecha: ${new Date().toLocaleDateString('es-CL')}`, 155, 24);
    pdf.text(`Cliente: ${clientName}`, 155, 30);
    topHeaderOffset = 38;
    if (obra.trim()) {
      pdf.text(`Obra: ${obra.trim()}`, 155, 36);
      topHeaderOffset = 44;
    }

    // Línea separadora
    pdf.setDrawColor(200, 200, 200);
    pdf.line(14, topHeaderOffset, 196, topHeaderOffset);

    // Encabezado tabla Termopaneles
    yPos = topHeaderOffset + 10;
    pdf.setFillColor(15, 118, 110); // teal-700
    pdf.rect(14, yPos - 6, 182, 9, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("Ref", 17, yPos);
    pdf.text("Cant.", 47, yPos);
    pdf.text("Ancho", 58, yPos);
    pdf.text("Alto", 73, yPos);
    pdf.text("Cristal 1", 88, yPos);
    pdf.text("Cristal 2", 121, yPos);
    pdf.text("Sep. (mm)", 154, yPos);
    pdf.text("Color Sep.", 175, yPos);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont("helvetica", "normal");

    yPos += 8;

    items.forEach((item, index) => {
      const labelVal = item.label || `V${index + 1}`;
      const splitLabel = pdf.splitTextToSize(labelVal, 28);
      
      let extrasText = "";
      const extrasParts = [];
      if (item.pulido) extrasParts.push("Pulido");
      if (item.micropersiana) extrasParts.push("Micropersiana");
      if (item.palillaje) extrasParts.push(`Palillaje (${item.palillajeColor || 'Blanco'}, ${item.palillajeHorizontales || 0} horizontales y ${item.palillajeVerticales || 0} verticales)`);
      if (item.conForma) extrasParts.push("Con Forma");
      if (extrasParts.length > 0) {
        extrasText = `Extras: ${extrasParts.join(", ")}`;
      }

      const rowHeight = extrasText ? 14 : Math.max(8, (splitLabel.length * 4) + 4);

      if (yPos + rowHeight > 275) {
        pdf.addPage();
        yPos = 20;
        // Repetir encabezado
        pdf.setFillColor(15, 118, 110);
        pdf.rect(14, yPos - 6, 182, 9, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.text("Ref", 17, yPos);
        pdf.text("Cant.", 47, yPos);
        pdf.text("Ancho", 58, yPos);
        pdf.text("Alto", 73, yPos);
        pdf.text("Cristal 1", 88, yPos);
        pdf.text("Cristal 2", 121, yPos);
        pdf.text("Sep. (mm)", 154, yPos);
        pdf.text("Color Sep.", 175, yPos);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont("helvetica", "normal");
        yPos += 8;
      }

      // Fila alternada
      if (index % 2 === 0) {
        pdf.setFillColor(240, 253, 250); // teal-50
        pdf.rect(14, yPos - 5, 182, rowHeight, 'F');
      }

      pdf.setFontSize(9);
      pdf.text(splitLabel, 17, yPos);
      pdf.text(`${item.cantidad}`, 47, yPos);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${item.ancho}`, 58, yPos);
      pdf.text(`${item.alto}`, 73, yPos);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${item.cristal1.tipo} ${item.cristal1.espesor}mm`, 88, yPos);
      pdf.text(`${item.cristal2.tipo} ${item.cristal2.espesor}mm`, 121, yPos);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${item.separador.espesor}`, 154, yPos);
      pdf.text(`${item.separador.color}`, 175, yPos);
      pdf.setFont("helvetica", "normal");

      if (extrasText) {
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(extrasText, 88, yPos + 4.5);
        pdf.setTextColor(0, 0, 0);
      }

      yPos += rowHeight;
    });

    // Línea de cierre
    pdf.setDrawColor(200, 200, 200);
    pdf.line(14, yPos, 196, yPos);

    yPos += 8;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(0, 0, 0);
    pdf.text(`Total a armar: ${totalM2.toFixed(2)} m²`, 14, yPos);

    const sanitizedClientName = clientName ? clientName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : 'Sin_Cliente';
    pdf.save(`Ordenes_Trabajo_${finalName}_${sanitizedClientName}.pdf`);
  };

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
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cotizador de Termopaneles</h1>
          <div className="flex items-center gap-1.5 text-slate-500 text-sm mt-1">
            <span>Presupuesto N°</span>
            <div className="px-3 py-1 bg-slate-50 border border-slate-200 rounded text-slate-700 font-semibold min-w-[5rem] text-center">
              {budgetName}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {sessionName && (
            <span className="text-xs text-slate-400 hidden sm:block mr-1">{sessionName}</span>
          )}

          <button
            onClick={handleProcessQuote}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none transform active:scale-95"
            disabled={isSyncingOdoo || items.length === 0}
            title="Enviar a Odoo, Imprimir Presupuesto y Generar Órdenes de Trabajo"
          >
            <Cloud size={16} className={isSyncingOdoo ? 'animate-spin' : ''} />
            {isSyncingOdoo ? 'Enviando a Odoo (puede tardar ~1-2 min)...' : 'Procesar Todo (Odoo + PDFs)'}
          </button>

          <button
            onClick={() => handleExportPDF()}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            disabled={items.length === 0}
            title="Imprimir Presupuesto Comercial en PDF"
          >
            <Printer size={16} />
            Presupuesto PDF
          </button>
          <button
            onClick={() => handleExportWorkOrders()}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            disabled={items.length === 0}
            title="Imprimir Órdenes de Trabajo en PDF"
          >
            <Printer size={16} />
            Taller PDF
          </button>
          <a href="/reports" className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <BarChart2 size={16} />
            Reportes
          </a>
          <form action={logoutFromOdoo}>
            <button
              type="submit"
              className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              title="Cerrar sesión"
            >
              <LogOut size={16} />
              Salir
            </button>
          </form>
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

      {/* Sección de Información del Cliente */}
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

      <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-slate-200">
        <table className="min-w-full text-xs sm:text-sm">
          <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[11px] tracking-wider">
            <tr>
              <th className="p-3 text-center border-r border-slate-200 w-32">Ref / Posición</th>
              <th className="p-3 text-center border-r border-slate-200 w-16">Cant.</th>
              <th className="p-3 text-center border-r border-slate-200 bg-blue-50/50" colSpan={2}>Dimensiones (mm)</th>
              <th className="p-3 text-center border-r border-slate-200 bg-amber-50/50" colSpan={2}>Cristal 1</th>
              <th className="p-3 text-center border-r border-slate-200 bg-amber-50/50" colSpan={2}>Cristal 2</th>
              <th className="p-3 text-center border-r border-slate-200 bg-gray-50/50" colSpan={2}>Separador</th>
              <th className="p-3 text-center border-r border-slate-200 w-24">Extras</th>
              <th className="p-3 text-center border-r border-slate-200 w-20">Desc. (%)</th>
              <th className="p-3 text-center border-r border-slate-200 w-28">P. Unit (V)</th>
              <th className="p-3 text-center border-r border-slate-200 w-28">Total</th>
              <th className="p-3 text-center w-10"></th>
            </tr>
            <tr className="text-[10px] text-slate-500 bg-slate-50">
              <th className="border-r border-slate-200"></th>
              <th className="border-r border-slate-200"></th>
              <th className="p-1 border-r border-t border-slate-200 text-center font-semibold">Ancho</th>
              <th className="p-1 border-r border-t border-slate-200 text-center font-semibold">Alto</th>
              <th className="p-1 border-r border-t border-slate-200 text-center font-semibold text-amber-700">Tipo</th>
              <th className="p-1 border-r border-t border-slate-200 text-center font-semibold text-amber-700">mm</th>
              <th className="p-1 border-r border-t border-slate-200 text-center font-semibold text-amber-700">Tipo</th>
              <th className="p-1 border-r border-t border-slate-200 text-center font-semibold text-amber-700">mm</th>
              <th className="p-1 border-r border-t border-slate-200 text-center font-semibold">mm</th>
              <th className="p-1 border-r border-t border-slate-200 text-center font-semibold">Color</th>
              <th className="p-1 border-r border-t border-slate-200 text-center font-semibold">Pu/M/P</th>
              <th className="p-1 border-r border-t border-slate-200 text-center font-semibold">%</th>
              <th className="border-r border-slate-200 text-center font-semibold">($)</th>
              <th className="border-r border-slate-200 text-center font-semibold">($)</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item, index) => {
              const calculo = calcularItem(item)

              return (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="p-1 border-r border-slate-100">
                    <input
                      type="text"
                      value={item.label !== undefined ? item.label : `V${index + 1}`}
                      onChange={e => updateItem(item.id, 'label', e.target.value)}
                      className="w-full text-center bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 outline-none font-medium text-slate-700 placeholder-slate-400"
                      placeholder={`V${index + 1}`}
                    />
                  </td>

                  {/* Cantidad */}
                  <td className="p-1 border-r border-slate-100">
                    <input
                      type="number" min="1"
                      value={item.cantidad}
                      onChange={e => updateItem(item.id, 'cantidad', parseInt(e.target.value) || 0)}
                      className="w-full text-center bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 outline-none font-medium text-slate-700"
                    />
                  </td>

                  {/* Ancho */}
                  <td className="p-1 border-r border-slate-100">
                    <input
                      type="number"
                      value={item.ancho === 0 ? "" : item.ancho}
                      onChange={e => updateItem(item.id, 'ancho', parseInt(e.target.value) || 0)}
                      className="w-full text-center bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 outline-none text-slate-600"
                    />
                  </td>
                  {/* Alto */}
                  <td className="p-1 border-r border-slate-100">
                    <input
                      type="number"
                      value={item.alto === 0 ? "" : item.alto}
                      onChange={e => updateItem(item.id, 'alto', parseInt(e.target.value) || 0)}
                      className="w-full text-center bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 outline-none text-slate-600"
                    />
                  </td>

                  {/* Cristal 1 */}
                  <td className="p-1 border-r border-slate-100">
                    <select
                      value={item.cristal1.tipo}
                      onChange={e => updateItem(item.id, 'cristal1.tipo', e.target.value)}
                      className="w-full bg-transparent text-[11px] p-1 outline-none min-w-[80px] text-slate-700"
                    >
                      {tiposUnicos.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="p-1 border-r border-slate-100">
                    <select
                      value={item.cristal1.espesor}
                      onChange={e => updateItem(item.id, 'cristal1.espesor', parseInt(e.target.value))}
                      className="w-full bg-transparent text-[11px] p-1 outline-none text-center text-slate-700"
                    >
                      {getEspesores(item.cristal1.tipo).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>

                  {/* Cristal 2 */}
                  <td className="p-1 border-r border-slate-100">
                    <select
                      value={item.cristal2.tipo}
                      onChange={e => updateItem(item.id, 'cristal2.tipo', e.target.value)}
                      className="w-full bg-transparent text-[11px] p-1 outline-none min-w-[80px] text-slate-700"
                    >
                      {tiposUnicos.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="p-1 border-r border-slate-100">
                    <select
                      value={item.cristal2.espesor}
                      onChange={e => updateItem(item.id, 'cristal2.espesor', parseInt(e.target.value))}
                      className="w-full bg-transparent text-[11px] p-1 outline-none text-center text-slate-700"
                    >
                      {getEspesores(item.cristal2.tipo).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>

                  {/* Separador */}
                  <td className="p-1 border-r border-slate-100">
                    <select
                      value={item.separador.espesor}
                      onChange={e => updateItem(item.id, 'separador.espesor', parseInt(e.target.value))}
                      className="w-full bg-transparent text-[11px] p-1 outline-none text-center text-slate-700"
                    >
                      {config?.separadores.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="p-1 border-r border-slate-100">
                    <select
                      value={item.separador.color}
                      onChange={e => updateItem(item.id, 'separador.color', e.target.value)}
                      className="w-full bg-transparent text-[11px] p-1 outline-none min-w-[60px] text-slate-700"
                    >
                      {config?.coloresSeparador.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>

                  {/* Extras (Condensados) */}
                  <td className="p-1 border-r border-slate-100 text-center">
                    <div className="flex justify-center gap-1.5 mb-1 flex-wrap">
                      <label title="Pulido" className="cursor-pointer text-xs flex items-center gap-0.5"><input type="checkbox" checked={item.pulido} onChange={e => updateItem(item.id, 'pulido', e.target.checked)} className="accent-teal-600" /> Pu</label>
                      <label title="Micropersiana" className="cursor-pointer text-xs flex items-center gap-0.5"><input type="checkbox" checked={item.micropersiana} onChange={e => updateItem(item.id, 'micropersiana', e.target.checked)} className="accent-teal-600" /> M</label>
                      <label title="Palillaje" className="cursor-pointer text-xs flex items-center gap-0.5"><input type="checkbox" checked={item.palillaje} onChange={e => updateItem(item.id, 'palillaje', e.target.checked)} className="accent-teal-600" /> P</label>
                    </div>
                    {item.palillaje && (
                      <div className="mt-1 flex flex-col gap-1 text-[10px] bg-slate-50 p-1.5 rounded border border-slate-200 text-left max-w-[110px] mx-auto shadow-sm">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-slate-500">Color:</span>
                          <select
                            value={item.palillajeColor || 'Blanco'}
                            onChange={e => updateItem(item.id, 'palillajeColor', e.target.value)}
                            className="bg-white border border-slate-200 rounded px-1 py-0.5 text-[9px] text-slate-700 outline-none w-[60px]"
                          >
                            <option value="Blanco">Blanco</option>
                            <option value="Negro">Negro</option>
                            <option value="Marron">Marron</option>
                            <option value="Toffe">Toffe</option>
                          </select>
                        </div>
                        <div className="flex gap-2 justify-between">
                          <div className="flex items-center">
                            <span className="font-semibold text-slate-500 mr-0.5">H:</span>
                            <input
                              type="number"
                              min="0"
                              value={item.palillajeHorizontales ?? 0}
                              onChange={e => updateItem(item.id, 'palillajeHorizontales', parseInt(e.target.value) || 0)}
                              className="bg-white border border-slate-200 rounded w-7 py-0.5 text-center text-[9px] text-slate-700 outline-none"
                            />
                          </div>
                          <div className="flex items-center">
                            <span className="font-semibold text-slate-500 mr-0.5">V:</span>
                            <input
                              type="number"
                              min="0"
                              value={item.palillajeVerticales ?? 0}
                              onChange={e => updateItem(item.id, 'palillajeVerticales', parseInt(e.target.value) || 0)}
                              className="bg-white border border-slate-200 rounded w-7 py-0.5 text-center text-[9px] text-slate-700 outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Descuento */}
                  <td className="p-1 border-r border-slate-100">
                    <input
                      type="number"
                      value={item.descuento || ""}
                      onChange={e => updateItem(item.id, 'descuento', parseInt(e.target.value) || 0)}
                      className="w-full text-center bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 outline-none text-sm text-slate-700"
                      placeholder="0"
                    />
                  </td>

                  {/* Precio Unitario */}
                  <td className="p-1 border-r border-slate-100">
                    <input
                      type="number"
                      value={item.precioUnitario}
                      onChange={e => updateItem(item.id, 'precioUnitario', parseInt(e.target.value) || 0)}
                      className="w-full text-right bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 outline-none font-mono text-sm text-slate-700"
                    />
                  </td>

                  {/* Total Línea */}
                  <td className="p-1 border-r border-slate-100 text-right bg-slate-50/50 font-mono text-sm text-slate-800 font-medium px-2">
                    ${calculo.totalLinea.toLocaleString()}
                  </td>

                  {/* Eliminar */}
                  <td className="p-1 text-center">
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors p-1"
                      title="Eliminar fila"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>

                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
            <tr>
              <td colSpan={13} className="p-2 text-right text-slate-600 text-sm border-r border-slate-100">Total Neto:</td>
              <td className="p-2 text-right text-slate-900 font-mono text-base px-2">
                ${totalNeto.toLocaleString()}
              </td>
              <td></td>
            </tr>
            <tr>
              <td colSpan={13} className="p-2 text-right text-slate-600 text-sm border-r border-slate-100">IVA (19%):</td>
              <td className="p-2 text-right text-slate-900 font-mono text-base px-2">
                ${Math.round(totalNeto * 0.19).toLocaleString()}
              </td>
              <td></td>
            </tr>
            <tr className="bg-slate-100/50">
              <td colSpan={13} className="p-3 text-right text-slate-800 text-sm border-r border-slate-100">Total:</td>
              <td className="p-3 text-right text-teal-700 font-mono text-lg font-bold px-2">
                ${Math.round(totalNeto * 1.19).toLocaleString()}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-6 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <button
          onClick={addItem}
          className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-lg shadow-sm flex items-center gap-2 transition-all hover:shadow-md text-sm font-medium"
        >
          <Plus size={18} /> Agregar Fila
        </button>
        <div className="text-sm text-slate-500 italic">
          * Los precios base se calculan automáticamente según el m² de vidrio.
        </div>
      </div>

      {/* Footer Fijo con Resumen de Metros Cuadrados */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-200 shadow-[0_-8px_30px_rgb(0,0,0,0.04)] p-4 z-40">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-50 text-teal-600 rounded-lg">
              <ClipboardList size={20} />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Metraje Total</p>
              <p className="text-sm sm:text-base font-bold text-slate-800">
                Total Metros Cuadrados: <span className="text-teal-600 font-mono">{totalM2.toFixed(2)} m²</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Total Neto</p>
              <p className="text-sm font-bold text-slate-800 font-mono">${totalNeto.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Total (con IVA)</p>
              <p className="text-sm font-bold text-teal-700 font-mono">${Math.round(totalNeto * 1.19).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </footer>
    </div >
  )
}

export default function CotizadorTermopanel() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-slate-500">Cargando...</div>}>
      <CotizadorTermopanelContent />
    </Suspense>
  )
}
