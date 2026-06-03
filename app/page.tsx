"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { TermopanelItem, calcularItem, calcularTotal } from "@/lib/calculos/termopanel"
import { PRECIOS_VIDRIOS, Vidrio, TIPOS_UNICOS as STATIC_TIPOS_UNICOS } from "@/lib/data/vidrios"
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getTermopanelConfig, TermopanelConfig } from '@/lib/configService';
import { useSearchParams, useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
import { Save, Printer, Plus, Trash2, Settings, Cloud, ClipboardList, LogOut } from 'lucide-react';
import { guardarCotizacionEnOdoo } from '@/app/actions/odoo';
import { logoutFromOdoo } from '@/app/actions/auth';


function CotizadorTermopanelContent() {
  const [config, setConfig] = useState<TermopanelConfig | null>(null);
  const [tiposUnicos, setTiposUnicos] = useState<string[]>(STATIC_TIPOS_UNICOS);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [items, setItems] = useState<TermopanelItem[]>([
    {
      id: "1",
      cantidad: 1,
      ancho: 1000,
      alto: 1000,
      cristal1: { tipo: "Incoloro", espesor: 4 },
      cristal2: { tipo: "Incoloro", espesor: 4 },
      separador: { espesor: 10, color: "Mate" },
      gas: false,
      micropersiana: false,
      palillaje: false,
      precioUnitario: 0
    }
  ])

  // Estado para Información del Cliente y Presupuesto
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [observations, setObservations] = useState('');
  const [budgetNumber, setBudgetNumber] = useState(1);
  const [budgetDate, setBudgetDate] = useState('');

  const searchParams = useSearchParams();
  const editId = searchParams.get('editId');
  const [isSaving, setIsSaving] = useState(false);
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
      
      // Update initial items to use the loaded config if needed, but defaults are fine
      setIsLoadingConfig(false);
    };
    fetchConfig();
  }, []);

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
          setClientAddress(data.clientAddress || '');
          setObservations(data.observations || '');
          setBudgetNumber(data.budgetNumber || 1);
          setItems(data.items || []);
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

    const fetchNextId = async () => {
      try {
        const q = query(
          collection(db, 'presupuestos_termopaneles'),
          orderBy('budgetNumber', 'desc'),
          limit(1)
        );
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const lastData = querySnapshot.docs[0].data();
          setBudgetNumber((lastData.budgetNumber || 0) + 1);
        } else {
          setBudgetNumber(1);
        }
      } catch (e) {
        console.error("Error fetching ID:", e);
      }
    };
    fetchNextId();

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

      // Calcular precio sugerido automágicamente
      const p1 = getPrecioVidrio(updatedItem.cristal1.tipo, updatedItem.cristal1.espesor)
      const p2 = getPrecioVidrio(updatedItem.cristal2.tipo, updatedItem.cristal2.espesor)

      const metros = (updatedItem.ancho * updatedItem.alto) / 1_000_000
      const costoVidrios = (p1 + p2) * metros

      // Actualizar automáticamente el Precio Unitario con el Costo Vidrios Base.
      updatedItem.precioUnitario = Math.round(costoVidrios)

      return updatedItem
    }))
  }

  function addItem() {
    const defaultTipo = "Incoloro"
    const defaultEspesor = 4
    const newItem: TermopanelItem = {
      id: crypto.randomUUID(),
      cantidad: 1,
      ancho: 0,
      alto: 0,
      cristal1: { tipo: defaultTipo, espesor: defaultEspesor },
      cristal2: { tipo: defaultTipo, espesor: defaultEspesor },
      separador: { espesor: 10, color: "Mate" },
      gas: false,
      micropersiana: false,
      palillaje: false,
      precioUnitario: 0
    }
    setItems([...items, newItem])
  }

  function removeItem(id: string) {
    if (items.length === 1) return
    setItems(items.filter(i => i.id !== id))
  }

  const totalNeto = calcularTotal(items)

  const handleSaveBudget = async () => {
    if (!clientName) {
      alert("Por favor ingrese el nombre del cliente");
      return;
    }
    setIsSaving(true);
    try {
      const budgetData = {
        clientName,
        clientAddress,
        observations,
        budgetNumber,
        items,
        totalNeto,
        updatedAt: serverTimestamp(),
        type: 'termopanel'
      };

      if (editId) {
        await setDoc(doc(db, 'presupuestos_termopaneles', editId), budgetData, { merge: true });
        alert("Presupuesto actualizado correctamente");
      } else {
        await addDoc(collection(db, 'presupuestos_termopaneles'), {
          ...budgetData,
          createdAt: serverTimestamp()
        });
        alert("Presupuesto guardado correctamente");
      }
    } catch (error) {
      console.error("Error saving budget:", error);
      alert("Error al guardar el presupuesto");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncOdoo = async () => {
    if (!clientName) {
      alert("Por favor ingrese el nombre del cliente para sincronizar con Odoo");
      return;
    }
    setIsSyncingOdoo(true);
    try {
      const odooRes = await guardarCotizacionEnOdoo({
        clientName,
        clientAddress,
        observations,
        budgetNumber,
        items,
        totalNeto
      });

      if (odooRes.exito) {
        alert(`¡Orden de venta confirmada en Odoo! Se generó la orden de fabricación. (ID: ${odooRes.cotizacionId})`);
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

  const handleExportPDF = async () => {
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
    doc.text(`N° Presupuesto: ${budgetNumber}`, 150, 22);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 150, 28);

    // Información del Cliente
    doc.setFontSize(12);
    doc.text("Información del Cliente", 14, 45);
    doc.setFontSize(10);
    doc.text(`Nombre: ${clientName}`, 14, 53);
    doc.text(`Dirección: ${clientAddress}`, 14, 59);

    // Encabezado de Tabla
    let yPos = 75;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, yPos - 5, 182, 8, 'F');
    doc.setFont("helvetica", "bold");
    doc.text("Cant.", 16, yPos);
    doc.text("Dim. (mm)", 30, yPos);
    doc.text("Configuración", 70, yPos);
    doc.text("Unitario", 150, yPos);
    doc.text("Total", 175, yPos);
    doc.setFont("helvetica", "normal");

    yPos += 10;

    items.forEach((item, index) => {
      const calculo = calcularItem(item);

      // Verificar salto de página
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }

      const configDesc = `C1: ${item.cristal1.tipo} ${item.cristal1.espesor}mm | C2: ${item.cristal2.tipo} ${item.cristal2.espesor}mm | Sep: ${item.separador.espesor}mm ${item.separador.color}`;

      doc.text(item.cantidad.toString(), 16, yPos);
      doc.text(`${item.ancho} x ${item.alto}`, 30, yPos);

      // Ajustar texto para configuración
      const splitConfig = doc.splitTextToSize(configDesc, 75);
      doc.text(splitConfig, 70, yPos);

      doc.text(`$${item.precioUnitario.toLocaleString('es-CL')}`, 150, yPos);
      doc.text(`$${calculo.totalLinea.toLocaleString('es-CL')}`, 175, yPos);

      yPos += (splitConfig.length * 5) + 5;
    });

    // Total
    doc.line(14, yPos, 196, yPos);
    yPos += 10;
    doc.setFont("helvetica", "bold");
    doc.text(`Total Neto: $${totalNeto.toLocaleString('es-CL')}`, 140, yPos);

    // Observaciones
    if (observations) {
      yPos += 15;
      doc.setFontSize(11);
      doc.text("Observaciones:", 14, yPos);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const splitObs = doc.splitTextToSize(observations, 180);
      doc.text(splitObs, 14, yPos + 6);
    }

    doc.save(`Presupuesto_Termopaneles_${budgetNumber}.pdf`);
  };

  const handleExportWorkOrders = async () => {
    if (items.length === 0) return;
    const pdf = new jsPDF();

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
    pdf.text(`N° Presupuesto: ${budgetNumber}`, 155, 18);
    pdf.text(`Fecha: ${new Date().toLocaleDateString('es-CL')}`, 155, 24);
    pdf.text(`Cliente: ${clientName}`, 155, 30);

    // Línea separadora
    pdf.setDrawColor(200, 200, 200);
    pdf.line(14, 38, 196, 38);

    // Encabezado tabla Corte Vidrio
    let yPos = 48;
    pdf.setFillColor(51, 65, 85); // slate-700
    pdf.rect(14, yPos - 6, 182, 9, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("#", 17, yPos);
    pdf.text("Cant.", 25, yPos);
    pdf.text("Ancho (mm)", 45, yPos);
    pdf.text("Alto (mm)", 75, yPos);
    pdf.text("Cristal 1", 105, yPos);
    pdf.text("Cristal 2", 150, yPos);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont("helvetica", "normal");

    yPos += 8;

    items.forEach((item, index) => {
      if (yPos > 275) {
        pdf.addPage();
        yPos = 20;
        // Repetir encabezado
        pdf.setFillColor(51, 65, 85);
        pdf.rect(14, yPos - 6, 182, 9, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.text("#", 17, yPos);
        pdf.text("Cant.", 25, yPos);
        pdf.text("Ancho (mm)", 45, yPos);
        pdf.text("Alto (mm)", 75, yPos);
        pdf.text("Cristal 1", 105, yPos);
        pdf.text("Cristal 2", 150, yPos);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont("helvetica", "normal");
        yPos += 8;
      }

      // Fila alternada
      if (index % 2 === 0) {
        pdf.setFillColor(248, 250, 252); // slate-50
        pdf.rect(14, yPos - 5, 182, 8, 'F');
      }

      pdf.setFontSize(9);
      pdf.text(`${index + 1}`, 17, yPos);
      pdf.text(`${item.cantidad}`, 25, yPos);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${item.ancho}`, 45, yPos);
      pdf.text(`${item.alto}`, 75, yPos);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${item.cristal1.tipo} ${item.cristal1.espesor}mm`, 105, yPos);
      pdf.text(`${item.cristal2.tipo} ${item.cristal2.espesor}mm`, 150, yPos);

      yPos += 8;
    });

    // Línea de cierre
    pdf.setDrawColor(200, 200, 200);
    pdf.line(14, yPos, 196, yPos);

    // Nota al pie
    yPos += 10;
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text("* Las medidas de los cristales corresponden al termopanel completo. Ajustar descuentos según separador.", 14, yPos);
    if (observations) {
      yPos += 8;
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "bold");
      pdf.text("Observaciones:", 14, yPos);
      pdf.setFont("helvetica", "normal");
      const splitObs = pdf.splitTextToSize(observations, 180);
      pdf.text(splitObs, 14, yPos + 5);
    }

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
    pdf.text(`N° Presupuesto: ${budgetNumber}`, 155, 18);
    pdf.text(`Fecha: ${new Date().toLocaleDateString('es-CL')}`, 155, 24);
    pdf.text(`Cliente: ${clientName}`, 155, 30);

    // Línea separadora
    pdf.setDrawColor(200, 200, 200);
    pdf.line(14, 38, 196, 38);

    // Encabezado tabla Termopaneles
    yPos = 48;
    pdf.setFillColor(15, 118, 110); // teal-700
    pdf.rect(14, yPos - 6, 182, 9, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("#", 17, yPos);
    pdf.text("Cant.", 24, yPos);
    pdf.text("Ancho", 38, yPos);
    pdf.text("Alto", 56, yPos);
    pdf.text("Cristal 1", 72, yPos);
    pdf.text("Cristal 2", 112, yPos);
    pdf.text("Sep. (mm)", 150, yPos);
    pdf.text("Color Sep.", 175, yPos);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont("helvetica", "normal");

    yPos += 8;

    items.forEach((item, index) => {
      if (yPos > 275) {
        pdf.addPage();
        yPos = 20;
        // Repetir encabezado
        pdf.setFillColor(15, 118, 110);
        pdf.rect(14, yPos - 6, 182, 9, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.text("#", 17, yPos);
        pdf.text("Cant.", 24, yPos);
        pdf.text("Ancho", 38, yPos);
        pdf.text("Alto", 56, yPos);
        pdf.text("Cristal 1", 72, yPos);
        pdf.text("Cristal 2", 112, yPos);
        pdf.text("Sep. (mm)", 150, yPos);
        pdf.text("Color Sep.", 175, yPos);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont("helvetica", "normal");
        yPos += 8;
      }

      // Fila alternada
      if (index % 2 === 0) {
        pdf.setFillColor(240, 253, 250); // teal-50
        pdf.rect(14, yPos - 5, 182, 8, 'F');
      }

      pdf.setFontSize(9);
      pdf.text(`${index + 1}`, 17, yPos);
      pdf.text(`${item.cantidad}`, 24, yPos);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${item.ancho}`, 38, yPos);
      pdf.text(`${item.alto}`, 56, yPos);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${item.cristal1.tipo} ${item.cristal1.espesor}mm`, 72, yPos);
      pdf.text(`${item.cristal2.tipo} ${item.cristal2.espesor}mm`, 112, yPos);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${item.separador.espesor}`, 150, yPos);
      pdf.text(`${item.separador.color}`, 175, yPos);
      pdf.setFont("helvetica", "normal");

      yPos += 8;
    });

    // Línea de cierre
    pdf.setDrawColor(200, 200, 200);
    pdf.line(14, yPos, 196, yPos);

    // Observaciones
    if (observations) {
      yPos += 10;
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "bold");
      pdf.text("Observaciones:", 14, yPos);
      pdf.setFont("helvetica", "normal");
      const splitObs = pdf.splitTextToSize(observations, 180);
      pdf.text(splitObs, 14, yPos + 5);
    }

    pdf.save(`Orden_Trabajo_${budgetNumber}.pdf`);
  };

  if (isLoadingConfig) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 bg-slate-50 min-h-screen font-sans">
      <header className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cotizador de Termopaneles</h1>
          <p className="text-slate-500 text-sm">Presupuesto N° {budgetNumber}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {sessionName && (
            <span className="text-xs text-slate-400 hidden sm:block mr-1">{sessionName}</span>
          )}
          <button
            onClick={handleSaveBudget}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            disabled={isSaving}
          >
            <Save size={16} />
            {isSaving ? 'Guardando...' : 'Guardar'}
          </button>
          <button
            onClick={handleSyncOdoo}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            disabled={isSyncingOdoo || items.length === 0}
            title="Sincronizar directamente con Odoo ERP"
          >
            <Cloud size={16} />
            {isSyncingOdoo ? 'Sincronizando...' : 'Enviar a Odoo'}
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            disabled={items.length === 0}
          >
            <Printer size={16} />
            Imprimir PDF
          </button>
          <button
            onClick={handleExportWorkOrders}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            disabled={items.length === 0}
            title="Generar órdenes de trabajo para Taller Corte Vidrio y Taller Termopaneles"
          >
            <ClipboardList size={16} />
            Orden de Trabajo
          </button>
          <a href="/admin/config" className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Settings size={16} />
            Configuración
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
      {/* Sección de Información del Cliente */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Nombre Cliente</label>
          <input
            suppressHydrationWarning
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Ej. Juan Pérez"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Dirección / Obra</label>
          <input
            suppressHydrationWarning
            type="text"
            value={clientAddress}
            onChange={(e) => setClientAddress(e.target.value)}
            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Ej. Av. Siempre Viva 123"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-600 mb-1">Observaciones</label>
          <textarea
            suppressHydrationWarning
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-20 resize-none"
            placeholder="Notas adicionales..."
          />
        </div>
      </div >

      <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-slate-200">
        <table className="min-w-full text-xs sm:text-sm">
          <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[11px] tracking-wider">
            <tr>
              <th className="p-3 text-center border-r border-slate-200 w-10">#</th>
              <th className="p-3 text-center border-r border-slate-200 w-16">Cant.</th>
              <th className="p-3 text-center border-r border-slate-200 bg-blue-50/50" colSpan={2}>Dimensiones (mm)</th>
              <th className="p-3 text-center border-r border-slate-200 bg-amber-50/50" colSpan={2}>Cristal 1</th>
              <th className="p-3 text-center border-r border-slate-200 bg-amber-50/50" colSpan={2}>Cristal 2</th>
              <th className="p-3 text-center border-r border-slate-200 bg-gray-50/50" colSpan={2}>Separador</th>
              <th className="p-3 text-center border-r border-slate-200 w-24">Extras</th>
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
              <th className="p-1 border-r border-t border-slate-200 text-center font-semibold">G/M/P</th>
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
                  <td className="p-2 text-center text-slate-400 font-medium">{index + 1}</td>

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
                      value={item.ancho}
                      onChange={e => updateItem(item.id, 'ancho', parseInt(e.target.value) || 0)}
                      className="w-full text-center bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 outline-none text-slate-600"
                    />
                  </td>
                  {/* Alto */}
                  <td className="p-1 border-r border-slate-100">
                    <input
                      type="number"
                      value={item.alto}
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
                  <td className="p-1 border-r border-slate-100 text-center space-x-2">
                    <label title="Gas Argón" className="cursor-pointer text-xs"><input type="checkbox" checked={item.gas} onChange={e => updateItem(item.id, 'gas', e.target.checked)} className="accent-teal-600" /> G</label>
                    <label title="Micropersiana" className="cursor-pointer text-xs"><input type="checkbox" checked={item.micropersiana} onChange={e => updateItem(item.id, 'micropersiana', e.target.checked)} className="accent-teal-600" /> M</label>
                    <label title="Palillaje" className="cursor-pointer text-xs"><input type="checkbox" checked={item.palillaje} onChange={e => updateItem(item.id, 'palillaje', e.target.checked)} className="accent-teal-600" /> P</label>
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
              <td colSpan={12} className="p-4 text-right text-slate-600 text-sm">Total Neto:</td>
              <td className="p-4 text-right text-slate-900 border-l border-slate-200 font-mono text-xl">
                ${totalNeto.toLocaleString()}
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
