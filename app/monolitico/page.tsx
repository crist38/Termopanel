"use client"

import { useState, useEffect, Suspense } from "react"
import { MonoliticoItem, calcularItemMonolitico, calcularTotalMonolitico } from "@/lib/calculos/monolitico"
import { TIPOS_UNICOS as STATIC_TIPOS_UNICOS } from "@/lib/data/vidrios"
import { collection, getDocs, query, orderBy, limit, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getTermopanelConfig, TermopanelConfig } from '@/lib/configService';
import { useSearchParams, useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
import { Printer, Plus, Trash2, Cloud, ClipboardList, CheckCircle, ArrowLeft } from 'lucide-react';
import { guardarCotizacionMonoliticoEnOdoo, obtenerCotizacionParaEditar, actualizarCotizacionEnOdoo } from '@/app/actions/odoo';
import { ClientSelector } from '@/components/ClientSelector';

function CotizadorMonoliticoContent() {
  const [config, setConfig] = useState<TermopanelConfig | null>(null);
  const [tiposUnicos, setTiposUnicos] = useState<string[]>(STATIC_TIPOS_UNICOS);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [items, setItems] = useState<MonoliticoItem[]>([
    {
      id: "1",
      label: "V1",
      cantidad: 1,
      ancho: 1000,
      alto: 1000,
      cristal: { tipo: "Incoloro", espesor: 4 },
      precioUnitario: 0
    }
  ])

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

  useEffect(() => {
    if (!config) return;
    setItems(prev => prev.map(item => {
      if (item.ancho <= 0 || item.alto <= 0) return item;
      const p = config.vidrios.find(v => v.tipo === item.cristal.tipo && v.espesor === item.cristal.espesor)?.precio ?? 0;
      const calc = calcularItemMonolitico(item.ancho, item.alto, p);
      return { ...item, precioUnitario: calc.totalLinea };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

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
        } else {
          // Fallback legacy a Firestore
          const docRef = doc(db, 'presupuestos_monoliticos', editId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setClientName(data.clientName || '');
            setObra(data.obra || '');
            setBudgetName(data.budgetName || data.budgetNumber?.toString() || 'Borrador');
            setItems(data.items || []);
          }
        }
      } catch (e) {
        console.error("Error loading budget:", e);
      }
    };
    loadBudget();
  }, [editId]);

  useEffect(() => {
    if (editId) return;
    const today = new Date();
    setBudgetDate(today.toLocaleDateString('es-ES'));

    const cookieVal = document.cookie.split('; ').find((r) => r.startsWith('odoo_user='))?.split('=').slice(1).join('=')
    if (cookieVal) {
      try {
        const parsed = JSON.parse(decodeURIComponent(cookieVal))
        setSessionName(parsed.name || parsed.email || '')
      } catch {}
    }
  }, [editId]);

  // Detectar borrador guardado en localStorage al montar el componente
  useEffect(() => {
    if (editId) return;

    const savedDraft = localStorage.getItem('monolitico_cotizacion_draft');
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
      localStorage.removeItem('monolitico_cotizacion_draft');
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
      localStorage.setItem('monolitico_cotizacion_draft', JSON.stringify(draft));
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
    localStorage.removeItem('monolitico_cotizacion_draft');
    setShowDraftBanner(false);
    setDraftData(null);
  };

  const totalNeto = calcularTotalMonolitico(items);
  const totalM2 = items.reduce((acc, item) => acc + ((item.ancho * item.alto) / 1000000) * item.cantidad, 0);

  function addItem() {
    setItems([
      ...items,
      {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
        label: `V${items.length + 1}`,
        cantidad: 1,
        ancho: 1000,
        alto: 1000,
        cristal: { tipo: "Incoloro", espesor: 4 },
        precioUnitario: 0
      }
    ])
  }

  function removeItem(id: string) {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id))
    }
  }

  function getEspesores(tipo: string) {
    if (!config) return [];
    return config.vidrios.filter(v => v.tipo === tipo).map(v => v.espesor).sort((a, b) => a - b)
  }

  function getPrecioVidrio(tipo: string, espesor: number) {
    if (!config) return 0;
    return config.vidrios.find(v => v.tipo === tipo && v.espesor === espesor)?.precio || 0
  }

  function updateItem(id: string, field: string, value: any) {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item
      let updatedItem = { ...item }

      if (field.includes('.')) {
        const [parent, child] = field.split('.')
        // @ts-ignore
        updatedItem = { ...item, [parent]: { ...item[parent], [child]: value } }
        if (child === 'tipo') {
          const espesores = getEspesores(value)
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

      const p = getPrecioVidrio(updatedItem.cristal.tipo, updatedItem.cristal.espesor)
      updatedItem.precioUnitario = calcularItemMonolitico(updatedItem.ancho, updatedItem.alto, p).totalLinea

      return updatedItem
    }))
  }

  async function handlePrint(overrideName?: string) {
    const finalName = overrideName || budgetName;
    const doc = new jsPDF();
    let yPos = 25;

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
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text("PRO WINDOWS", 50, yPos);
      yPos += 10;
      doc.setFontSize(14);
      doc.text("COTIZACIÓN DE CRISTALES MONOLÍTICOS", 50, yPos);
    } catch (e) {
      console.error("Error al cargar el logo en el PDF", e);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text("PRO WINDOWS", 14, yPos);
      yPos += 15;
      doc.setFontSize(14);
      doc.text("COTIZACIÓN DE CRISTALES MONOLÍTICOS", 14, yPos);
    }
    
    yPos += 12;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Presupuesto N°: ${finalName}`, 14, yPos);
    doc.text(`Fecha: ${budgetDate}`, 120, yPos);
    yPos += 7;
    doc.text(`Cliente: ${clientName || 'Sin Cliente'}`, 14, yPos);
    if (obra.trim()) {
      yPos += 7;
      doc.text(`Obra: ${obra.trim()}`, 14, yPos);
    }
    
    const totalM2 = items.reduce((acc, item) => acc + ((item.ancho * item.alto) / 1000000) * item.cantidad, 0);
    yPos += 7;
    doc.text(`Total Metros Cuadrados: ${totalM2.toFixed(2)} m²`, 14, yPos);

    yPos += 12;
    
    // Tabla
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(14, yPos, 182, 8, 'F');
    doc.text("Ref", 16, yPos + 6);
    doc.text("Cant", 30, yPos + 6);
    doc.text("Ancho", 45, yPos + 6);
    doc.text("Alto", 65, yPos + 6);
    doc.text("Cristal", 85, yPos + 6);
    doc.text("Área m2", 140, yPos + 6);
    doc.text("P. Unit", 160, yPos + 6);
    doc.text("Total", 180, yPos + 6);
    yPos += 10;
    
    doc.setFont("helvetica", "normal");
    
    items.forEach(item => {
      const area = (item.ancho * item.alto) / 1_000_000;
      const totalLinea = item.precioUnitario * item.cantidad;
      
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }

      doc.text(item.label || '', 16, yPos);
      doc.text(item.cantidad.toString(), 30, yPos);
      doc.text(item.ancho.toString(), 45, yPos);
      doc.text(item.alto.toString(), 65, yPos);
      doc.text(`${item.cristal.tipo} ${item.cristal.espesor}mm`, 85, yPos);
      doc.text(area.toFixed(2), 140, yPos);
      doc.text(`$${item.precioUnitario.toLocaleString()}`, 160, yPos);
      doc.text(`$${totalLinea.toLocaleString()}`, 180, yPos);
      
      yPos += 8;
    });

    yPos += 5;
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
      "Plazo de entrega a contar de 48 horas para cristales monolíticos, una vez recibida Orden de Compra.",
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

    yPos += 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);

    doc.text("Firma de aceptación del Cliente: ___________________________", 14, yPos);
    doc.text("Modalidad de Pago: __________________", 120, yPos);
    
    const sanitizedClientName = clientName ? clientName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : 'Sin_Cliente';
    doc.save(`Cotizacion_Monolitico_${finalName}_${sanitizedClientName}.pdf`);
  }

  async function handleExportWorkOrder(overrideName?: string) {
    const finalName = overrideName || budgetName;
    if (items.length === 0) return;
    const pdf = new jsPDF();
    const totalM2 = items.reduce((acc, item) => acc + ((item.ancho * item.alto) / 1000000) * item.cantidad, 0);

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

    if (logoBase64) pdf.addImage(logoBase64, 'PNG', 14, 10, 36, 18);

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
    pdf.text(`Cliente: ${clientName || 'Sin Cliente'}`, 155, 30);
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
    pdf.text("Ancho (mm)", 39, yPos);
    pdf.text("Alto (mm)", 68, yPos);
    pdf.text("Cant.", 97, yPos);
    pdf.text("Cristal Monolítico", 115, yPos);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont("helvetica", "normal");

    yPos += 8;

    items.forEach((item, index) => {
      const labelVal = item.label || `V${index + 1}`;
      const splitLabel = pdf.splitTextToSize(labelVal, 28);
      const rowHeight = Math.max(8, (splitLabel.length * 4) + 4);

      if (yPos + rowHeight > 275) {
        pdf.addPage();
        yPos = 20;
        pdf.setFillColor(51, 65, 85);
        pdf.rect(14, yPos - 6, 182, 9, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.text("Ref", 17, yPos);
        pdf.text("Ancho (mm)", 39, yPos);
        pdf.text("Alto (mm)", 68, yPos);
        pdf.text("Cant.", 97, yPos);
        pdf.text("Cristal Monolítico", 115, yPos);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont("helvetica", "normal");
        yPos += 8;
      }

      if (index % 2 === 0) {
        pdf.setFillColor(248, 250, 252);
        pdf.rect(14, yPos - 5, 182, rowHeight, 'F');
      }

      pdf.setFontSize(9);
      pdf.text(splitLabel, 17, yPos);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${item.ancho}`, 39, yPos);
      pdf.text(`${item.alto}`, 68, yPos);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${item.cantidad}`, 99, yPos);
      pdf.text(`${item.cristal.tipo} ${item.cristal.espesor}mm`, 115, yPos);

      yPos += rowHeight;
    });

    pdf.setDrawColor(200, 200, 200);
    pdf.line(14, yPos, 196, yPos);

    yPos += 8;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(0, 0, 0);
    pdf.text(`Total a cortar: ${totalM2.toFixed(2)} m²`, 14, yPos);

    const sanitizedClientName = clientName ? clientName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : 'Sin_Cliente';
    pdf.save(`Orden_Corte_${finalName}_${sanitizedClientName}.pdf`);
  }

  async function handleExportAllPDFs(overrideName?: string) {
    const finalBudgetNameVal = overrideName || budgetName;
    await handlePrint(finalBudgetNameVal);
    await handleExportWorkOrder(finalBudgetNameVal);
  }

  const handleProcessQuote = async (isConfirm: boolean = false) => {
    if (!clientName) {
      alert("Por favor ingrese el nombre del cliente antes de procesar.");
      return;
    }

    if (items.some(i => i.ancho === 0 || i.alto === 0)) {
      alert("Por favor complete todas las medidas (ancho y alto) de los cristales antes de enviar a Odoo.");
      return;
    }

    setIsSyncingOdoo(true);
    try {
      let response;
      const isOdooId = editId && /^\d+$/.test(editId);
      
      if (isOdooId) {
        response = await actualizarCotizacionEnOdoo({
          orderId: parseInt(editId),
          clientId,
          clientName,
          obra,
          items,
          totalNeto,
          isMonolitico: true,
          autoConfirm: isConfirm
        });
      } else {
        response = await guardarCotizacionMonoliticoEnOdoo({
          clientId,
          clientName,
          obra,
          budgetNumber: 0,
          items,
          totalNeto,
        });
      }

      if (response.exito) {
        if (isOdooId) {
          if (isConfirm) {
            alert(`✅ ¡Listo! Cotización ${response.cotizacionName} confirmada en Odoo con sus órdenes de fabricación. A continuación se descargarán los PDFs.`);
          } else {
            alert(`✅ ¡Listo! Cotización ${response.cotizacionName} actualizada como borrador en Odoo. A continuación se descargará el Presupuesto PDF.`);
          }
        } else {
          if (isConfirm) {
            alert(`✅ ¡Listo! Orden de venta ${response.cotizacionName} confirmada en Odoo con sus órdenes de fabricación. A continuación se descargarán los PDFs.`);
          } else {
            alert(`✅ ¡Listo! Cotización ${response.cotizacionName} guardada como borrador en Odoo. A continuación se descargará el Presupuesto PDF.`);
          }
        }
        
        const finalBudgetName = response.cotizacionName || 'Borrador';
        setBudgetName(finalBudgetName);

        if (isConfirm) {
          await handleExportAllPDFs(finalBudgetName);
        } else {
          await handleExportAllPDFs(finalBudgetName);
        }

        localStorage.removeItem('monolitico_cotizacion_draft');
        setClientName('');
        setObra('');
        setBudgetName('Borrador');
        setItems([{ id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15), label: "V1", cantidad: 1, ancho: 1000, alto: 1000, cristal: { tipo: "Incoloro", espesor: 4 }, precioUnitario: 0 }]);

        if (isOdooId) {
          router.push('/cotizaciones');
        }
      } else {
        alert(`Error al guardar en Odoo: ${response.error}`);
      }
    } catch (error) {
      console.error(error);
      alert('Ocurrió un error inesperado de red al conectar con Odoo.');
    } finally {
      setIsSyncingOdoo(false);
    }
  }

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
        <div className="flex items-center gap-4">
          <a href="/" className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-lg transition-colors hidden sm:flex">
            <ArrowLeft size={16} />
          </a>
          <img src="/logo.png" alt="ProWindows Logo" className="h-10 sm:h-12 object-contain" />
          <div className="hidden sm:block border-l-2 border-slate-200 pl-4">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Corte Monolítico</h2>
            <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-1">
              <span>Presupuesto N°</span>
              <div className="px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-slate-700 font-bold min-w-[4rem] text-center">
                {budgetName}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => handleProcessQuote(false)}
            className={`flex items-center gap-2 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none transform active:scale-95 ${
              editId && /^\d+$/.test(editId)
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
                : 'bg-gradient-to-r from-[#7a5973] to-[#6b4c64] hover:from-[#6b4c64] hover:to-[#5a3b53]'
            }`}
            disabled={isSyncingOdoo}
            title="Guardar como borrador en Odoo y generar PDF del Presupuesto"
          >
            <Cloud size={16} className={isSyncingOdoo ? 'animate-spin' : ''} />
            {isSyncingOdoo && !editId ? 'Guardando...' : 'Guardar Borrador / Presupuesto PDF'}
          </button>
          
          <button
            onClick={() => handleProcessQuote(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none transform active:scale-95"
            disabled={isSyncingOdoo}
            title="Confirmar Orden en Odoo, generar Órdenes de Fabricación y PDF de Taller"
          >
            <CheckCircle size={16} className={isSyncingOdoo ? 'animate-spin' : ''} />
            {isSyncingOdoo ? 'Procesando...' : 'Confirmar en Odoo y Enviar a Taller'}
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

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="w-full sm:w-1/3">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Nombre del Cliente</label>
            <ClientSelector
              value={clientName}
              clientId={clientId}
              onChange={(name, id) => {
                setClientName(name);
                setClientId(id);
              }}
            />
          </div>
          <div className="w-full sm:w-1/3">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Obra (Opcional)</label>
            <input
              type="text"
              value={obra}
              onChange={(e) => setObra(e.target.value)}
              placeholder="Nombre de la obra, dirección, etc."
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 text-slate-800"
            />
          </div>
          <div className="w-full sm:w-1/4">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Fecha Presupuesto</label>
            <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-700 font-medium">
              {budgetDate}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#7a5973] text-white">
              <tr>
                <th className="p-3 font-medium border-r border-[#6b4c64]">N°</th>
                <th className="p-3 font-medium border-r border-[#6b4c64] text-center w-20">Ref</th>
                <th className="p-3 font-medium border-r border-[#6b4c64] text-center w-20">Cant</th>
                <th className="p-3 font-medium border-r border-[#6b4c64] text-center w-24">Ancho (mm)</th>
                <th className="p-3 font-medium border-r border-[#6b4c64] text-center w-24">Alto (mm)</th>
                <th className="p-3 font-medium border-r border-[#6b4c64]" colSpan={2}>Cristal (Tipo / Espesor)</th>
                <th className="p-3 font-medium border-r border-[#6b4c64] text-right w-32">Precio Unit.</th>
                <th className="p-3 font-medium border-r border-[#6b4c64] text-right w-32">Total Lín.</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, index) => {
                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-2 text-center text-slate-400 text-xs border-r border-slate-100">{index + 1}</td>
                    <td className="p-1 border-r border-slate-100">
                      <input
                        type="text"
                        value={item.label || ''}
                        onChange={e => updateItem(item.id, 'label', e.target.value)}
                        placeholder={`V${index + 1}`}
                        className="w-full text-center bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 outline-none text-slate-700 font-medium"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-100">
                      <input
                        type="number"
                        min="1"
                        value={item.cantidad || ''}
                        onChange={e => updateItem(item.id, 'cantidad', parseInt(e.target.value) || 0)}
                        className="w-full text-center bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 outline-none font-medium text-slate-700"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-100">
                      <input
                        type="number"
                        value={item.ancho === 0 ? "" : item.ancho}
                        onChange={e => updateItem(item.id, 'ancho', parseInt(e.target.value) || 0)}
                        className="w-full text-center bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 outline-none text-slate-600"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-100">
                      <input
                        type="number"
                        value={item.alto === 0 ? "" : item.alto}
                        onChange={e => updateItem(item.id, 'alto', parseInt(e.target.value) || 0)}
                        className="w-full text-center bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 outline-none text-slate-600"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-100">
                      <select
                        value={item.cristal.tipo}
                        onChange={e => updateItem(item.id, 'cristal.tipo', e.target.value)}
                        className="w-full bg-transparent text-[11px] p-1 outline-none min-w-[80px] text-slate-700"
                      >
                        {tiposUnicos.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="p-1 border-r border-slate-100">
                      <select
                        value={item.cristal.espesor}
                        onChange={e => updateItem(item.id, 'cristal.espesor', parseInt(e.target.value))}
                        className="w-full bg-transparent text-[11px] p-1 outline-none text-center text-slate-700"
                      >
                        {getEspesores(item.cristal.tipo).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="p-1 border-r border-slate-100 text-right font-mono text-sm px-2">
                      ${item.precioUnitario.toLocaleString()}
                    </td>
                    <td className="p-1 border-r border-slate-100 text-right bg-slate-50/50 font-mono text-sm text-slate-800 font-medium px-2">
                      ${(item.precioUnitario * item.cantidad).toLocaleString()}
                    </td>
                    <td className="p-1 text-center">
                      <button onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
              <tr>
                <td colSpan={8} className="p-2 text-right text-slate-600 text-sm border-r border-slate-100">Total Neto:</td>
                <td className="p-2 text-right text-slate-900 font-mono text-base px-2">
                  ${totalNeto.toLocaleString()}
                </td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={8} className="p-2 text-right text-slate-600 text-sm border-r border-slate-100">IVA (19%):</td>
                <td className="p-2 text-right text-slate-900 font-mono text-base px-2">
                  ${Math.round(totalNeto * 0.19).toLocaleString()}
                </td>
                <td></td>
              </tr>
              <tr className="bg-slate-100/50">
                <td colSpan={8} className="p-3 text-right text-slate-800 text-sm border-r border-slate-100">Total:</td>
                <td className="p-3 text-right text-[#7a5973] font-mono text-lg font-bold px-2">
                  ${Math.round(totalNeto * 1.19).toLocaleString()}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-4">
        <button onClick={addItem} className="bg-[#7a5973] hover:bg-[#6b4c64] text-white px-5 py-2.5 rounded-lg shadow-sm flex items-center gap-2 transition-all text-sm font-medium">
          <Plus size={18} /> Agregar Fila
        </button>
        
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => handlePrint()}
            className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-200"
            title="Descargar Presupuesto PDF localmente"
          >
            <Printer size={16} /> Presupuesto PDF
          </button>
          
          <button
            onClick={() => handleExportWorkOrder()}
            className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-200"
            title="Descargar Taller PDF localmente"
          >
            <Printer size={16} /> Taller PDF
          </button>
        </div>
      </div>

      {/* Footer Fijo con Resumen de Metros Cuadrados */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-200 shadow-[0_-8px_30px_rgb(0,0,0,0.04)] p-4 z-40">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 text-[#7a5973] rounded-lg">
              <ClipboardList size={20} />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Metraje Total</p>
              <p className="text-sm sm:text-base font-bold text-slate-800">
                Total Metros Cuadrados: <span className="text-[#7a5973] font-mono">{totalM2.toFixed(2)} m²</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Valor Promedio por m²</p>
              <p className="text-sm font-bold text-slate-500 font-mono">${totalM2 > 0 ? Math.round(totalNeto / totalM2).toLocaleString() : '0'}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Total Neto</p>
              <p className="text-sm font-bold text-slate-800 font-mono">${totalNeto.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Total (con IVA)</p>
              <p className="text-sm font-bold text-[#7a5973] font-mono">${Math.round(totalNeto * 1.19).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default function CotizadorMonolitico() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-slate-500">Cargando...</div>}>
      <CotizadorMonoliticoContent />
    </Suspense>
  )
}
