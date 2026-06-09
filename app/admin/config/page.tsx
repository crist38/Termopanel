"use client"

import { useState, useEffect } from 'react';
import { getTermopanelConfig, saveTermopanelConfig, TermopanelConfig } from '@/lib/configService';
import { Vidrio } from '@/lib/data/vidrios';
import { Save, Plus, Trash2, ArrowLeft, Settings, Layers, Hash } from 'lucide-react';

export default function ConfigPage() {
  const [config, setConfig] = useState<TermopanelConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // New Vidrio State
  const [newVidrioTipo, setNewVidrioTipo] = useState('');
  const [newVidrioEspesor, setNewVidrioEspesor] = useState('');
  const [newVidrioPrecio, setNewVidrioPrecio] = useState('');

  // New Separador State
  const [newSeparador, setNewSeparador] = useState('');

  // New Color State
  const [newColor, setNewColor] = useState('');

  useEffect(() => {
    const fetchConfig = async () => {
      setIsLoading(true);
      const conf = await getTermopanelConfig();
      setConfig(conf);
      setIsLoading(false);
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      await saveTermopanelConfig(config);
      alert('Configuración guardada correctamente.');
    } catch (error) {
      console.error('Error al guardar:', error);
      alert('Hubo un error al guardar la configuración.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Vidrios ---
  const addVidrio = () => {
    if (!newVidrioTipo || !newVidrioEspesor || !newVidrioPrecio || !config) return;
    const nuevo: Vidrio = {
      codigo: `${newVidrioTipo.substring(0, 3).toUpperCase()}${newVidrioEspesor}`,
      tipo: newVidrioTipo,
      espesor: parseInt(newVidrioEspesor),
      precio: parseInt(newVidrioPrecio)
    };
    setConfig({ ...config, vidrios: [...config.vidrios, nuevo] });
    setNewVidrioTipo('');
    setNewVidrioEspesor('');
    setNewVidrioPrecio('');
  };

  const updateVidrio = (index: number, field: keyof Vidrio, value: any) => {
    if (!config) return;
    const newVidrios = [...config.vidrios];
    newVidrios[index] = {
      ...newVidrios[index],
      [field]: field === 'espesor' || field === 'precio' ? parseInt(value) || 0 : value
    };
    setConfig({ ...config, vidrios: newVidrios });
  };

  const removeVidrio = (index: number) => {
    if (!config) return;
    const newVidrios = [...config.vidrios];
    newVidrios.splice(index, 1);
    setConfig({ ...config, vidrios: newVidrios });
  };

  // --- Separadores ---
  const addSeparador = () => {
    if (!newSeparador || !config) return;
    const val = parseInt(newSeparador);
    if (!config.separadores.includes(val)) {
      setConfig({ ...config, separadores: [...config.separadores, val].sort((a, b) => a - b) });
    }
    setNewSeparador('');
  };

  const updateSeparador = (index: number, value: string) => {
    if (!config) return;
    const newSeparadores = [...config.separadores];
    newSeparadores[index] = parseInt(value) || 0;
    setConfig({ ...config, separadores: newSeparadores });
  };

  const removeSeparador = (val: number) => {
    if (!config) return;
    setConfig({ ...config, separadores: config.separadores.filter(s => s !== val) });
  };

  // --- Colores ---
  const addColor = () => {
    if (!newColor || !config) return;
    if (!config.coloresSeparador.includes(newColor)) {
      setConfig({ ...config, coloresSeparador: [...config.coloresSeparador, newColor] });
    }
    setNewColor('');
  };

  const updateColor = (index: number, value: string) => {
    if (!config) return;
    const newColores = [...config.coloresSeparador];
    newColores[index] = value;
    setConfig({ ...config, coloresSeparador: newColores });
  };

  const removeColor = (color: string) => {
    if (!config) return;
    setConfig({ ...config, coloresSeparador: config.coloresSeparador.filter(c => c !== color) });
  };

  // --- Parámetros Generales ---
  const updateManoDeObra = (value: string) => {
    if (!config) return;
    setConfig({
      ...config,
      parametrosCalculo: {
        ...(config.parametrosCalculo || {}),
        costoManoDeObra: parseInt(value) || 0
      }
    });
  };

  const updateFactorGG = (value: string) => {
    if (!config) return;
    setConfig({
      ...config,
      parametrosCalculo: {
        ...(config.parametrosCalculo || {}),
        factorGG: parseFloat(value) || 1.0
      }
    });
  };

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center text-slate-500">Cargando configuración...</div>;
  }

  // Protección de ruta (opcional, basado en ADMIN_EMAILS)
  // Descomentar si solo los admins pueden ver esto
  // if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
  //   return <div className="p-8 text-center text-red-500 font-bold">No tienes permiso para ver esta página.</div>;
  // }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen font-sans max-w-5xl mx-auto">
      <header className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Settings className="text-amber-500" /> Configuración de Precios
          </h1>
          <p className="text-slate-500 text-sm">Administra los cristales, separadores y colores disponibles</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shadow-sm"
            disabled={isSaving}
          >
            <Save size={18} />
            {isSaving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
          <a href="/" className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <ArrowLeft size={16} /> Volver
          </a>
        </div>
      </header>

      {config && (
        <div className="space-y-8">
          {/* CRISTALES */}
          <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-100 px-6 py-4 border-b border-slate-200 flex items-center gap-2">
              <Layers className="text-blue-500" size={20} />
              <h2 className="text-lg font-bold text-slate-800">Cristales y Precios (m²)</h2>
            </div>
            <div className="p-6">
              {/* Add form */}
              <div className="flex flex-wrap gap-4 items-end mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Tipo (ej. Incoloro)</label>
                  <input type="text" value={newVidrioTipo} onChange={e => setNewVidrioTipo(e.target.value)} className="p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none w-40 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Espesor (mm)</label>
                  <input type="number" value={newVidrioEspesor} onChange={e => setNewVidrioEspesor(e.target.value)} className="p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none w-24 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Precio x m² ($)</label>
                  <input type="number" value={newVidrioPrecio} onChange={e => setNewVidrioPrecio(e.target.value)} className="p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none w-32 text-sm" />
                </div>
                <button onClick={addVidrio} className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-1 transition-colors h-[38px]">
                  <Plus size={16} /> Agregar
                </button>
              </div>

              {/* Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="p-3 text-left font-semibold">Tipo</th>
                      <th className="p-3 text-left font-semibold">Espesor (mm)</th>
                      <th className="p-3 text-right font-semibold">Precio x m²</th>
                      <th className="p-3 text-center font-semibold w-16">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {config.vidrios.map((v, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2">
                          <input
                            type="text"
                            value={v.tipo}
                            onChange={e => updateVidrio(i, 'tipo', e.target.value)}
                            className="p-1.5 border border-slate-200 rounded focus:ring-2 focus:ring-blue-500 outline-none w-full text-sm font-medium text-slate-800 bg-transparent hover:bg-slate-50/50 focus:bg-white transition-colors"
                          />
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              value={v.espesor === 0 ? '' : v.espesor}
                              onChange={e => updateVidrio(i, 'espesor', e.target.value)}
                              className="p-1.5 border border-slate-200 rounded focus:ring-2 focus:ring-blue-500 outline-none w-20 text-sm text-slate-600 bg-transparent hover:bg-slate-50/50 focus:bg-white text-center transition-colors"
                            />
                            <span className="text-xs text-slate-400">mm</span>
                          </div>
                        </td>
                        <td className="p-2 text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className="text-xs text-slate-400 font-mono font-medium">$</span>
                            <input
                              type="number"
                              value={v.precio === 0 ? '' : v.precio}
                              onChange={e => updateVidrio(i, 'precio', e.target.value)}
                              className="p-1.5 border border-slate-200 rounded focus:ring-2 focus:ring-blue-500 outline-none w-32 text-sm text-slate-800 bg-transparent hover:bg-slate-50/50 focus:bg-white text-right font-mono font-medium transition-colors"
                            />
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          <button onClick={() => removeVidrio(i)} className="text-red-400 hover:text-red-600 transition-colors p-1" title="Eliminar">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* SEPARADORES */}
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-100 px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                <Hash className="text-teal-500" size={20} />
                <h2 className="text-lg font-bold text-slate-800">Espesores de Separador</h2>
              </div>
              <div className="p-6">
                <div className="flex gap-2 mb-4">
                  <input type="number" placeholder="Ej. 14" value={newSeparador} onChange={e => setNewSeparador(e.target.value)} className="p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none w-full text-sm" />
                  <button onClick={addSeparador} className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded text-sm font-medium transition-colors">
                    <Plus size={16} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {config.separadores.map((s, i) => (
                    <div key={i} className="bg-slate-100 border border-slate-200 rounded-full px-3.5 py-1 flex items-center gap-1.5 text-slate-700 font-semibold text-sm shadow-sm">
                      <input
                        type="number"
                        value={s === 0 ? '' : s}
                        onChange={e => updateSeparador(i, e.target.value)}
                        className="bg-transparent border-b border-transparent focus:border-slate-400 outline-none w-10 text-center font-bold text-slate-800"
                      />
                      <span className="text-xs text-slate-400 font-normal">mm</span>
                      <button onClick={() => removeSeparador(s)} className="text-slate-400 hover:text-red-500 ml-0.5" title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* COLORES */}
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-100 px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                <Hash className="text-amber-500" size={20} />
                <h2 className="text-lg font-bold text-slate-800">Colores de Separador</h2>
              </div>
              <div className="p-6">
                <div className="flex gap-2 mb-4">
                  <input type="text" placeholder="Ej. Blanco" value={newColor} onChange={e => setNewColor(e.target.value)} className="p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none w-full text-sm" />
                  <button onClick={addColor} className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded text-sm font-medium transition-colors">
                    <Plus size={16} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {config.coloresSeparador.map((c, i) => (
                    <div key={i} className="bg-slate-100 border border-slate-200 rounded-full px-3.5 py-1 flex items-center gap-1.5 text-slate-700 font-semibold text-sm shadow-sm">
                      <input
                        type="text"
                        value={c}
                        onChange={e => updateColor(i, e.target.value)}
                        className="bg-transparent border-b border-transparent focus:border-slate-400 outline-none w-20 text-center font-semibold text-slate-800"
                      />
                      <button onClick={() => removeColor(c)} className="text-slate-400 hover:text-red-500 ml-0.5" title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          {/* PARAMETROS DE CALCULO */}
          <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-100 px-6 py-4 border-b border-slate-200 flex items-center gap-2">
              <Settings className="text-purple-500" size={20} />
              <h2 className="text-lg font-bold text-slate-800">Parámetros Adicionales</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-700">Mano de Obra (por m²)</label>
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 transition-shadow">
                    <span className="text-slate-400 font-mono font-medium">$</span>
                    <input
                      type="number"
                      value={config.parametrosCalculo?.costoManoDeObra === 0 ? '' : (config.parametrosCalculo?.costoManoDeObra || '')}
                      onChange={e => updateManoDeObra(e.target.value)}
                      className="bg-transparent outline-none w-full text-slate-800 font-mono font-medium"
                      placeholder="Ej: 1650"
                    />
                  </div>
                  <p className="text-xs text-slate-500">Este costo se suma a los materiales base.</p>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-700">Factor de Recargo (GG)</label>
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 transition-shadow">
                    <span className="text-slate-400 font-mono font-medium">x</span>
                    <input
                      type="number"
                      step="0.0001"
                      value={config.parametrosCalculo?.factorGG || ''}
                      onChange={e => updateFactorGG(e.target.value)}
                      className="bg-transparent outline-none w-full text-slate-800 font-mono font-medium"
                      placeholder="Ej: 1.1009"
                    />
                  </div>
                  <p className="text-xs text-slate-500">Multiplicador sobre la base (ej. 1.1009 = 110.09%).</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
