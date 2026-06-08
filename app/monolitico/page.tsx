"use client"

import { useState, useEffect, Suspense } from "react"
import { MonoliticoItem, calcularItemMonolitico, calcularTotalMonolitico } from "@/lib/calculos/monolitico"
import { TIPOS_UNICOS as STATIC_TIPOS_UNICOS } from "@/lib/data/vidrios"
import { collection, getDocs, query, orderBy, limit, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getTermopanelConfig, TermopanelConfig } from '@/lib/configService';
import { useSearchParams, useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
import { Printer, Plus, Trash2, Cloud } from 'lucide-react';
import { guardarCotizacionMonoliticoEnOdoo } from '@/app/actions/odoo';
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
  const [clientId, setClientId] = useState<number | undefined>(undefined);
  const [budgetName, setBudgetName] = useState('Borrador');
  const [budgetDate, setBudgetDate] = useState('');

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
        const docRef = doc(db, 'presupuestos_monoliticos', editId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setClientName(data.clientName || '');
          setBudgetName(data.budgetName || data.budgetNumber?.toString() || 'Borrador');
          setItems(data.items || []);
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

  const totalNeto = calcularTotalMonolitico(items);

  function addItem() {
    setItems([
      ...items,
      {
        id: crypto.randomUUID(),
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

  function handlePrint(overrideName?: string) {
    const finalName = overrideName || budgetName;
    const doc = new jsPDF();
    let yPos = 20;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("PRO WINDOWS", 14, yPos);
    
    yPos += 15;
    doc.setFontSize(14);
    doc.text("COTIZACIÓN DE CRISTALES MONOLÍTICOS", 14, yPos);
    
    yPos += 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Presupuesto N°: ${finalName}`, 14, yPos);
    doc.text(`Fecha: ${budgetDate}`, 120, yPos);
    yPos += 7;
    doc.text(`Cliente: ${clientName || 'Sin Cliente'}`, 14, yPos);

    yPos += 15;
    
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
      
      doc.text(item.label || '', 16, yPos);
      doc.text(item.cantidad.toString(), 30, yPos);
      doc.text(item.ancho.toString(), 45, yPos);
      doc.text(item.alto.toString(), 65, yPos);
      doc.text(`${item.cristal.tipo} ${item.cristal.espesor}mm`, 85, yPos);
      doc.text(area.toFixed(2), 140, yPos);
      doc.text(`$${item.precioUnitario.toLocaleString()}`, 160, yPos);
      doc.text(`$${totalLinea.toLocaleString()}`, 180, yPos);
      
      yPos += 8;
      
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
    });

    yPos += 5;
    doc.line(14, yPos, 196, yPos);
    yPos += 10;
    doc.setFont("helvetica", "bold");
    doc.text(`Total Neto: $${totalNeto.toLocaleString('es-CL')}`, 140, yPos);
    
    const sanitizedClientName = clientName ? clientName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : 'Sin_Cliente';
    doc.save(`Cotizacion_Monolitico_${finalName}_${sanitizedClientName}.pdf`);
  }

  async function handleProcessQuote() {
    if (!clientName) {
      alert("Por favor ingrese el nombre del cliente antes de procesar.");
      return;
    }

    if (items.some(i => i.ancho === 0 || i.alto === 0)) {
      alert("Por favor complete todas las medidas (ancho y alto) de los cristales antes de enviar a Odoo.");
      return;
    }

    const conf = confirm(`¿Estás seguro de enviar la Cotización de Cristales N° ${budgetName} a Odoo?\n\nEsto creará la nota de venta y la Orden de Trabajo para el Taller Corte Vidrio.`);
    if (!conf) return;

    setIsSyncingOdoo(true);
    try {
      const response = await guardarCotizacionMonoliticoEnOdoo({
        clientId,
        clientName,
        budgetNumber: 0,
        items,
        totalNeto,
      });

      if (response.exito) {
        alert(`¡Cotización enviada exitosamente a Odoo!\nOrden de Venta: ${response.cotizacionName}`);
        
        const finalBudgetName = response.cotizacionName || 'Borrador';
        setBudgetName(finalBudgetName);

        handlePrint(finalBudgetName);

        setClientName('');
        setBudgetName('Borrador');
        setItems([{ id: crypto.randomUUID(), label: "V1", cantidad: 1, ancho: 1000, alto: 1000, cristal: { tipo: "Incoloro", espesor: 4 }, precioUnitario: 0 }]);

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
    <div className="p-4 bg-slate-50 min-h-screen font-sans">
      <header className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Corte de Vidrios Monolíticos</h1>
          <div className="flex items-center gap-1.5 text-slate-500 text-sm mt-1">
            <span>Presupuesto N°</span>
            <div className="px-3 py-1 bg-slate-50 border border-slate-200 rounded text-slate-700 font-semibold min-w-[5rem] text-center">
              {budgetName}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={handleProcessQuote}
            disabled={isSyncingOdoo}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-5 py-2.5 rounded-lg shadow-sm flex items-center gap-2 transition-all font-medium text-sm"
          >
            <Cloud size={18} />
            {isSyncingOdoo ? 'Sincronizando...' : 'Enviar a Odoo'}
          </button>
          <button
            onClick={() => handlePrint()}
            className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-lg shadow-sm flex items-center gap-2 transition-all font-medium text-sm"
          >
            <Printer size={18} /> Exportar PDF
          </button>
        </div>
      </header>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="w-full sm:w-1/3">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Nombre del Cliente / Obra</label>
            <ClientSelector
              value={clientName}
              clientId={clientId}
              onChange={(name, id) => {
                setClientName(name);
                setClientId(id);
              }}
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
                <td colSpan={8} className="p-4 text-right text-slate-600 text-sm">Total Neto:</td>
                <td className="p-4 text-right text-slate-900 border-l border-slate-200 font-mono text-xl">
                  ${totalNeto.toLocaleString()}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="mt-6 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <button onClick={addItem} className="bg-[#7a5973] hover:bg-[#6b4c64] text-white px-5 py-2.5 rounded-lg shadow-sm flex items-center gap-2 transition-all text-sm font-medium">
          <Plus size={18} /> Agregar Fila
        </button>
      </div>
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
