"use client"

import { useState } from "react";
import { PuntoFigura, areaPoligono, perimetroPoligono, ladosPoligono } from "@/lib/calculos/termopanel";
import { FiguraFabricacion, MedidaFabricacion } from "@/lib/types/fabricacion";
import { Plus, Trash2, Pencil, X, Check } from "lucide-react";

// Figuras que se pueden elegir; triángulos y trapecios se dibujan como forma libre
type ShapeType = 'rectangulo' | 'arco' | 'medio_arco' | 'circulo' | 'personalizada';

interface Forma {
  shape: ShapeType;
  a: number;   // ancho / base / diámetro
  b: number;   // alto (rectángulo), altura base (arco) o altura recta (medio arco)
  b1: number;  // altura total (medio arco)
  r: number;   // radio / flecha (arco)
  puntos: PuntoFigura[]; // forma libre: vértices en mm (origen abajo-izquierda, Y hacia arriba)
}

export interface OpcionesVidrio {
  vidrios: { tipo: string; espesor: number }[];
  separadores: number[];
  coloresSeparador: string[];
}

const radioArco = (f: Forma) => (f.r > 0 ? f.r : Math.round(f.a / 2));

function boundingBox(f: Forma): { w: number; h: number } {
  if (f.shape === 'personalizada') {
    if (f.puntos.length < 3) return { w: 0, h: 0 };
    const xs = f.puntos.map(p => p.x);
    const ys = f.puntos.map(p => p.y);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  if (f.shape === 'arco') return { w: f.a, h: f.b + radioArco(f) };
  if (f.shape === 'medio_arco') return { w: f.a, h: f.b1 };
  if (f.shape === 'circulo') return { w: f.a, h: f.a };
  return { w: f.a, h: f.b };
}

function areaM2(f: Forma): number {
  if (f.shape === 'personalizada') return areaPoligono(f.puntos) / 1_000_000;
  if (f.shape === 'arco') return (f.a * f.b + (Math.PI * f.a * radioArco(f)) / 4) / 1_000_000;
  if (f.shape === 'medio_arco') return (f.a * f.b + (Math.PI * f.a * Math.max(0, f.b1 - f.b)) / 4) / 1_000_000;
  if (f.shape === 'circulo') return (Math.PI * Math.pow(f.a / 2, 2)) / 1_000_000;
  return (f.a * f.b) / 1_000_000;
}

function perimetroMl(f: Forma): number {
  if (f.shape === 'personalizada') return perimetroPoligono(f.puntos) / 1000;
  if (f.shape === 'arco') {
    const r = radioArco(f);
    const arco = (Math.PI * Math.sqrt(2 * (Math.pow(f.a / 2, 2) + r * r))) / 2;
    return (f.a + 2 * f.b + arco) / 1000;
  }
  if (f.shape === 'medio_arco') {
    const hArco = Math.max(0, f.b1 - f.b);
    const arco = (Math.PI * Math.sqrt(2 * (f.a * f.a + hArco * hArco))) / 4;
    return (f.a + f.b + f.b1 + arco) / 1000;
  }
  if (f.shape === 'circulo') return (Math.PI * f.a) / 1000;
  return (2 * (f.a + f.b)) / 1000;
}

// Lleva la figura al origen (mínimo X e Y en 0) para que las coordenadas sean siempre positivas
function normalizarPuntos(pts: PuntoFigura[]): PuntoFigura[] {
  if (pts.length === 0) return pts;
  const minX = Math.min(...pts.map(p => p.x));
  const minY = Math.min(...pts.map(p => p.y));
  return pts.map(p => ({ x: Math.round(p.x - minX), y: Math.round(p.y - minY) }));
}

// Convierte la figura actual en vértices editables (las curvas pasan a tramos rectos)
function formaAPuntos(f: Forma): PuntoFigura[] {
  const A = f.a || 1000;
  if (f.shape === 'rectangulo') {
    const B = f.b || 1000;
    return [{ x: 0, y: 0 }, { x: A, y: 0 }, { x: A, y: B }, { x: 0, y: B }];
  }
  if (f.shape === 'arco') {
    const r = radioArco({ ...f, a: A });
    const pts: PuntoFigura[] = [{ x: 0, y: 0 }, { x: A, y: 0 }];
    const tramos = 12;
    // Sin altura base, los extremos del arco coinciden con las esquinas de la base
    for (let i = f.b > 0 ? 0 : 1; i <= (f.b > 0 ? tramos : tramos - 1); i++) {
      const ang = (i * Math.PI) / tramos;
      pts.push({ x: Math.round(A / 2 + (A / 2) * Math.cos(ang)), y: Math.round(f.b + r * Math.sin(ang)) });
    }
    return pts;
  }
  if (f.shape === 'medio_arco') {
    const hBase = Math.min(f.b || 0, f.b1 || 0);
    const hArco = Math.max(0, (f.b1 || 0) - hBase);
    const pts: PuntoFigura[] = [{ x: 0, y: 0 }, { x: A, y: 0 }];
    const tramos = 8;
    for (let i = hBase > 0 ? 0 : 1; i <= tramos; i++) {
      const ang = (i * Math.PI) / (2 * tramos);
      pts.push({ x: Math.round(A * Math.cos(ang)), y: Math.round(hBase + hArco * Math.sin(ang)) });
    }
    return pts;
  }
  if (f.shape === 'circulo') {
    const pts: PuntoFigura[] = [];
    const tramos = 24;
    for (let i = 0; i < tramos; i++) {
      const ang = (i * 2 * Math.PI) / tramos;
      pts.push({ x: Math.round(A / 2 + (A / 2) * Math.cos(ang)), y: Math.round(A / 2 + (A / 2) * Math.sin(ang)) });
    }
    return pts;
  }
  return f.puntos;
}

function medidasFigura(f: Forma): NonNullable<MedidaFabricacion['medidasFigura']> {
  const bounding = boundingBox(f);
  if (f.shape === 'personalizada') return { a: bounding.w, b: bounding.h, puntos: normalizarPuntos(f.puntos) };
  if (f.shape === 'arco') return { a: f.a, b: f.b, r: radioArco(f) };
  if (f.shape === 'medio_arco') return { a: f.a, b: f.b, b1: f.b1 };
  if (f.shape === 'circulo') return { a: f.a, b: f.a, r: Math.round(f.a / 2) };
  return { a: f.a, b: f.b };
}

// Reconstruye el estado del editor a partir de una medida guardada
function formaDesdeMedida(m: MedidaFabricacion): Forma {
  const med = m.medidasFigura;
  const base: Forma = { shape: 'rectangulo', a: m.ancho || 0, b: m.alto || 0, b1: 1500, r: 500, puntos: [] };
  const tipo: FiguraFabricacion = m.tipoFigura || 'rectangulo';
  if (tipo === 'rectangulo' || !med) return base;
  if (tipo === 'arco') return { ...base, shape: 'arco', a: med.a, b: med.b, r: med.r || Math.round(med.a / 2) };
  if (tipo === 'medio_arco') return { ...base, shape: 'medio_arco', a: med.a, b: med.b, b1: med.b1 || 0 };
  if (tipo === 'circulo') return { ...base, shape: 'circulo', a: med.a };
  if (tipo === 'personalizada' && med.puntos && med.puntos.length >= 3) {
    return { ...base, shape: 'personalizada', puntos: med.puntos };
  }
  // Triángulos y trapecios guardados se abren como forma libre
  if (tipo === 'triangulo') {
    return { ...base, shape: 'personalizada', puntos: [{ x: 0, y: 0 }, { x: med.a, y: 0 }, { x: 0, y: med.b }] };
  }
  if (tipo === 'trapecio') {
    return {
      ...base,
      shape: 'personalizada',
      puntos: [{ x: 0, y: 0 }, { x: med.a, y: 0 }, { x: med.a, y: med.b2 || 0 }, { x: 0, y: med.b1 || 0 }],
    };
  }
  return base;
}

// Coordenadas escaladas de la figura para el lienzo de 400 x 300
function geometriaSvg(f: Forma) {
  const maxDrawW = 240;
  const maxDrawH = 170;
  const cx = 200;
  const cy = 135;

  if (f.shape === 'rectangulo') {
    const realW = f.a || 1000;
    const realH = f.b || 1000;
    const scale = Math.min(maxDrawW / realW, maxDrawH / realH);
    const w = realW * scale;
    const h = realH * scale;
    const xStart = cx - w / 2;
    const xEnd = cx + w / 2;
    const yBottom = cy + h / 2;
    const yTop = cy - h / 2;
    return {
      path: `M ${xStart},${yBottom} L ${xEnd},${yBottom} L ${xEnd},${yTop} L ${xStart},${yTop} Z`,
      lines: [
        { x1: xStart, y1: yBottom + 22, x2: xEnd, y2: yBottom + 22, label: `Ancho = ${f.a} mm` },
        { x1: xStart - 22, y1: yTop, x2: xStart - 22, y2: yBottom, label: `Alto = ${f.b} mm` },
      ],
    };
  }

  if (f.shape === 'arco') {
    const realW = f.a || 1000;
    const realHBase = f.b || 0;
    const realR = f.r > 0 ? f.r : Math.round(realW / 2);
    const scale = Math.min(maxDrawW / realW, maxDrawH / (realHBase + realR || 1));
    const w = realW * scale;
    const hBase = realHBase * scale;
    const rY = realR * scale;
    const xStart = cx - w / 2;
    const xEnd = cx + w / 2;
    const yBottom = cy + (hBase + rY) / 2;
    const yBaseTop = yBottom - hBase;
    const yArchTop = yBaseTop - rY;

    const lines = [
      { x1: xStart, y1: yBottom + 22, x2: xEnd, y2: yBottom + 22, label: `A = ${f.a} mm` },
      { x1: cx, y1: yArchTop, x2: cx, y2: yBaseTop, label: `R = ${realR} mm` },
    ];
    if (realHBase > 0) {
      lines.push({ x1: xStart - 22, y1: yBaseTop, x2: xStart - 22, y2: yBottom, label: `B = ${f.b} mm` });
      lines.push({ x1: xEnd + 22, y1: yArchTop, x2: xEnd + 22, y2: yBottom, label: `H = ${f.b + realR} mm` });
    }
    return {
      path: `M ${xStart},${yBottom} L ${xEnd},${yBottom} L ${xEnd},${yBaseTop} A ${w / 2},${rY} 0 0,0 ${xStart},${yBaseTop} Z`,
      lines,
    };
  }

  if (f.shape === 'medio_arco') {
    const realW = f.a || 1000;
    const realHTotal = f.b1 || 1000;
    const realHBase = Math.min(f.b || 0, realHTotal);
    const scale = Math.min(maxDrawW / realW, maxDrawH / realHTotal);
    const w = realW * scale;
    const hTotal = realHTotal * scale;
    const hBase = realHBase * scale;
    const xStart = cx - w / 2;
    const xEnd = cx + w / 2;
    const yBottom = cy + hTotal / 2;
    const yRight = yBottom - hBase;
    const yLeft = yBottom - hTotal;
    return {
      path: `M ${xStart},${yBottom} L ${xEnd},${yBottom} L ${xEnd},${yRight} A ${w},${hTotal - hBase} 0 0,0 ${xStart},${yLeft} Z`,
      lines: [
        { x1: xStart, y1: yBottom + 22, x2: xEnd, y2: yBottom + 22, label: `A = ${f.a} mm` },
        { x1: xEnd + 22, y1: yRight, x2: xEnd + 22, y2: yBottom, label: `B = ${f.b} mm` },
        { x1: xStart - 22, y1: yLeft, x2: xStart - 22, y2: yBottom, label: `H = ${f.b1} mm` },
      ],
    };
  }

  if (f.shape === 'circulo') {
    const realDiam = f.a || 1000;
    const r = (realDiam * Math.min(maxDrawW / realDiam, maxDrawH / realDiam)) / 2;
    return {
      path: `M ${cx},${cy - r} A ${r},${r} 0 1,1 ${cx - 0.01},${cy - r} Z`,
      lines: [{ x1: cx - r, y1: cy, x2: cx + r, y2: cy, label: `Diámetro = ${f.a} mm` }],
    };
  }

  return { path: '', lines: [] };
}

const NOMBRES_SHAPE: Record<ShapeType, string> = {
  rectangulo: 'Rect.',
  arco: 'Arco',
  medio_arco: 'M. Arco',
  circulo: 'Círculo',
  personalizada: 'Libre',
};

const inputDim = "w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-cyan-500";
const selectCls = "w-full p-2 border border-slate-300 rounded-lg text-xs bg-transparent outline-none focus:ring-2 focus:ring-blue-500 text-slate-700";
const tituloCls = "text-sm font-bold text-slate-700 uppercase tracking-wider mb-3";

/**
 * Editor completo de una medida de termopanel: figura (con forma libre), dimensiones,
 * cristales, separador y extras. Igual al de Formas, pero sin precios.
 */
export function EditorMedida({
  inicial,
  opciones,
  esNueva,
  onGuardar,
  onCancelar,
}: {
  inicial: MedidaFabricacion;
  opciones: OpcionesVidrio;
  esNueva: boolean;
  onGuardar: (medida: MedidaFabricacion) => void;
  onCancelar: () => void;
}) {
  const [forma, setForma] = useState<Forma>(() => formaDesdeMedida(inicial));
  const [puntoActivo, setPuntoActivo] = useState<number | null>(null);
  // Mientras se arrastra un vértice se congela la escala del lienzo para que la figura no salte
  const [dragView, setDragView] = useState<{ idx: number; scale: number; offX: number; offY: number } | null>(null);

  const [ref, setRef] = useState(inicial.ref);
  const [cantidad, setCantidad] = useState(inicial.cantidad || 1);
  const [cristal1, setCristal1] = useState(inicial.cristal1);
  const [cristal2, setCristal2] = useState(inicial.cristal2);
  const [separador, setSeparador] = useState(inicial.separador);
  const [pulido, setPulido] = useState(!!inicial.pulido);
  const [micropersiana, setMicropersiana] = useState(!!inicial.micropersiana);
  const [palillaje, setPalillaje] = useState(!!inicial.palillaje);
  const [palillajeColor, setPalillajeColor] = useState(inicial.palillajeColor || 'Blanco');
  const [palillajeHorizontales, setPalillajeHorizontales] = useState(inicial.palillajeHorizontales || 0);
  const [palillajeVerticales, setPalillajeVerticales] = useState(inicial.palillajeVerticales || 0);
  const [observacion, setObservacion] = useState(inicial.observacion || '');
  const [error, setError] = useState<string | null>(null);

  const { shape, puntos } = forma;
  const actualizar = (cambio: Partial<Forma>) => setForma(prev => ({ ...prev, ...cambio }));
  const setPuntos = (fn: (prev: PuntoFigura[]) => PuntoFigura[]) => setForma(prev => ({ ...prev, puntos: fn(prev.puntos) }));
  const numero = (e: React.ChangeEvent<HTMLInputElement>) => parseInt(e.target.value) || 0;

  // Las cotizaciones de obra traen espesores que no están en la lista de precios (ej: separador de 9 mm):
  // el valor actual siempre se ofrece como opción.
  const tiposUnicos = Array.from(new Set([...opciones.vidrios.map(v => v.tipo), cristal1.tipo, cristal2.tipo]));
  const getEspesores = (tipo: string, actual: number) => {
    const normalizado = tipo.trim().toLowerCase();
    const lista = opciones.vidrios.filter(v => v.tipo.trim().toLowerCase() === normalizado).map(v => v.espesor);
    return Array.from(new Set([...lista, actual])).filter(e => e > 0).sort((a, b) => a - b);
  };
  const espesoresSeparador = Array.from(new Set([...opciones.separadores, separador.espesor])).filter(e => e > 0).sort((a, b) => a - b);
  const coloresSeparador = Array.from(new Set([...opciones.coloresSeparador, separador.color]));

  const cambiarTipoCristal = (
    cristal: { tipo: string; espesor: number },
    setCristal: (c: { tipo: string; espesor: number }) => void,
    tipo: string
  ) => {
    const lista = getEspesores(tipo, 0);
    setCristal({ tipo, espesor: lista.includes(cristal.espesor) || lista.length === 0 ? cristal.espesor : lista[0] });
  };

  const seleccionarFigura = (t: ShapeType) => {
    if (t === shape) return;
    setPuntoActivo(null);
    if (t === 'personalizada') {
      // La opción "Libre" siempre parte de un triángulo de 1000 x 1000 mm
      actualizar({ shape: t, puntos: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }] });
    } else {
      actualizar({ shape: t, a: forma.a || 1000, b: forma.b || 1000 });
    }
  };

  const handleEditarForma = () => {
    if (shape === 'personalizada') return;
    setPuntoActivo(null);
    actualizar({ shape: 'personalizada', puntos: formaAPuntos(forma) });
  };

  const updatePunto = (idx: number, campo: 'x' | 'y', valor: number) => {
    setPuntos(prev => prev.map((p, i) => (i === idx ? { ...p, [campo]: valor } : p)));
  };

  // Inserta un vértice nuevo en la mitad del lado que sale del punto idx
  const insertarPunto = (idx: number) => {
    const p = puntos[idx];
    const q = puntos[(idx + 1) % puntos.length];
    const nuevo = { x: Math.round((p.x + q.x) / 2), y: Math.round((p.y + q.y) / 2) };
    setPuntos(prev => [...prev.slice(0, idx + 1), nuevo, ...prev.slice(idx + 1)]);
    setPuntoActivo(idx + 1);
  };

  const eliminarPunto = (idx: number) => {
    if (puntos.length <= 3) return;
    setPuntos(prev => prev.filter((_, i) => i !== idx));
    setPuntoActivo(null);
  };

  const bounding = boundingBox(forma);
  const svgData = geometriaSvg(forma);

  // Geometría del editor de forma libre: vértices arrastrables, "+" en los lados y largo de cada lado
  const getCustomGeometry = () => {
    if (shape !== 'personalizada' || puntos.length < 3) return null;
    let view = dragView;
    if (!view) {
      const xs = puntos.map(p => p.x);
      const ys = puntos.map(p => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const w = Math.max(...xs) - minX || 1;
      const h = Math.max(...ys) - minY || 1;
      const scale = Math.min(240 / w, 170 / h);
      view = { idx: -1, scale, offX: 200 - (minX + w / 2) * scale, offY: 135 + (minY + h / 2) * scale };
    }
    const v = view;
    const verts = puntos.map(p => ({ x: v.offX + p.x * v.scale, y: v.offY - p.y * v.scale }));
    const centroX = verts.reduce((acc, p) => acc + p.x, 0) / verts.length;
    const centroY = verts.reduce((acc, p) => acc + p.y, 0) / verts.length;
    const largos = ladosPoligono(puntos);
    const lados = verts.map((p, i) => {
      const q = verts[(i + 1) % verts.length];
      const mx = (p.x + q.x) / 2;
      const my = (p.y + q.y) / 2;
      const largoPx = Math.hypot(q.x - p.x, q.y - p.y);
      // La etiqueta se empuja hacia afuera de la figura
      const dx = mx - centroX;
      const dy = my - centroY;
      const d = Math.hypot(dx, dy) || 1;
      return { idx: i, mx, my, lx: mx + (dx / d) * 16, ly: my + (dy / d) * 16 + 4, visible: largoPx > 30, label: `${Math.round(largos[i])}` };
    });
    return { view: v, verts, lados, path: `M ${verts.map(p => `${p.x},${p.y}`).join(' L ')} Z` };
  };

  const customGeo = getCustomGeometry();

  const svgPointFromEvent = (e: React.PointerEvent<SVGElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(ctm.inverse());
  };

  const handleVertexPointerDown = (e: React.PointerEvent<SVGElement>, idx: number) => {
    if (!customGeo) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setPuntoActivo(idx);
    setDragView({ ...customGeo.view, idx });
  };

  const handleVertexPointerMove = (e: React.PointerEvent<SVGElement>) => {
    if (!dragView) return;
    const pt = svgPointFromEvent(e);
    if (!pt) return;
    // El arrastre ajusta de 10 en 10 mm; la medida exacta se escribe en la lista de puntos
    const x = Math.round((pt.x - dragView.offX) / dragView.scale / 10) * 10;
    const y = Math.round((dragView.offY - pt.y) / dragView.scale / 10) * 10;
    setPuntos(prev => prev.map((p, i) => (i === dragView.idx ? { x, y } : p)));
  };

  const handleVertexPointerUp = () => {
    if (!dragView) return;
    setDragView(null);
    setPuntos(prev => normalizarPuntos(prev));
  };

  const handleGuardar = () => {
    if (shape === 'personalizada' && (puntos.length < 3 || areaPoligono(puntos) <= 0)) {
      setError("La forma libre necesita al menos 3 puntos que formen una figura con área.");
      return;
    }
    if (bounding.w <= 0 || bounding.h <= 0) {
      setError("Falta el ancho o el alto de la figura.");
      return;
    }
    if (shape === 'medio_arco' && forma.b > forma.b1) {
      setError("En el medio arco la altura recta no puede ser mayor que la altura total.");
      return;
    }
    onGuardar({
      ref: ref.trim(),
      cantidad: Math.max(1, cantidad),
      ancho: bounding.w,
      alto: bounding.h,
      cristal1,
      cristal2,
      separador,
      pulido,
      micropersiana,
      palillaje,
      palillajeColor,
      palillajeHorizontales,
      palillajeVerticales,
      tipoFigura: shape,
      ...(shape !== 'rectangulo' && { medidasFigura: medidasFigura(forma) }),
      observacion: observacion.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-slate-50 w-full max-w-6xl sm:rounded-2xl shadow-2xl flex flex-col max-h-full sm:max-h-[95vh] overflow-hidden">
        {/* Encabezado */}
        <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 flex-shrink-0">
          <h2 className="font-bold text-slate-800 text-base">
            {esNueva ? 'Nueva medida' : 'Editar medida'}{ref.trim() ? ` · ${ref.trim()}` : ''}
          </h2>
          <button onClick={onCancelar} className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-500" title="Cerrar sin guardar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* CONFIGURADOR */}
            <div className="lg:col-span-5 bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-6">

              {/* SELECCIÓN DE FIGURA */}
              <div>
                <h3 className={tituloCls}>1. Seleccionar Figura</h3>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['rectangulo', 'arco', 'medio_arco', 'circulo', 'personalizada'] as ShapeType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => seleccionarFigura(t)}
                      title={t === 'personalizada' ? 'Dibujar una forma libre a partir de un triángulo' : undefined}
                      className={`p-2 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all text-[10px] font-bold uppercase leading-tight ${
                        shape === t
                          ? 'border-cyan-500 bg-cyan-50 text-cyan-600'
                          : 'border-slate-200 hover:border-slate-300 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <svg className="w-8 h-8" viewBox="0 0 100 100">
                        {t === 'rectangulo' && <rect x="22" y="15" width="56" height="70" fill="none" stroke="currentColor" strokeWidth="6" />}
                        {t === 'arco' && <path d="M 20,80 L 80,80 L 80,50 A 30,30 0 0,0 20,50 Z" fill="none" stroke="currentColor" strokeWidth="6" />}
                        {t === 'medio_arco' && <path d="M 20,80 L 80,80 L 80,50 A 60,30 0 0,0 20,20 Z" fill="none" stroke="currentColor" strokeWidth="6" />}
                        {t === 'circulo' && <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="6" />}
                        {t === 'personalizada' && <polygon points="15,80 85,80 85,45 55,20 15,40" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray="10 5" />}
                      </svg>
                      <span>{NOMBRES_SHAPE[t]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* DIMS EN MILÍMETROS */}
              <div>
                <h3 className={tituloCls}>2. Dimensiones (mm)</h3>
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  {shape === 'rectangulo' && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Ancho</label>
                        <input type="number" inputMode="numeric" autoFocus={esNueva} value={forma.a || ''} onChange={(e) => actualizar({ a: numero(e) })} className={`${inputDim} font-bold`} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Alto</label>
                        <input type="number" inputMode="numeric" value={forma.b || ''} onChange={(e) => actualizar({ b: numero(e) })} className={`${inputDim} font-bold`} />
                      </div>
                    </>
                  )}
                  {shape === 'circulo' && (
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-500 mb-1">Diámetro (A)</label>
                      <input type="number" inputMode="numeric" value={forma.a || ''} onChange={(e) => actualizar({ a: numero(e) })} className={inputDim} />
                    </div>
                  )}
                  {shape === 'arco' && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Ancho / Base (A)</label>
                        <input type="number" inputMode="numeric" value={forma.a || ''} onChange={(e) => actualizar({ a: numero(e) })} className={inputDim} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Altura Base (B)</label>
                        <input type="number" inputMode="numeric" value={forma.b === 0 ? '0' : (forma.b || '')} onChange={(e) => actualizar({ b: numero(e) })} className={inputDim} />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-xs font-bold text-slate-500">Radio / Flecha (R)</label>
                          <button
                            type="button"
                            onClick={() => actualizar({ r: Math.round(forma.a / 2) })}
                            className="text-[10px] text-cyan-600 hover:text-cyan-800 font-semibold underline"
                            title="Calcular medio punto (A / 2)"
                          >
                            Medio Punto (A/2)
                          </button>
                        </div>
                        <input type="number" inputMode="numeric" value={forma.r || ''} onChange={(e) => actualizar({ r: numero(e) })} className={inputDim} placeholder="Ej: 260" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Altura Total (B + R)</label>
                        <div className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-700 font-semibold flex items-center h-[38px]">
                          {bounding.h} mm
                        </div>
                      </div>
                    </>
                  )}
                  {shape === 'medio_arco' && (
                    <>
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-slate-500 mb-1">Ancho Base (A)</label>
                        <input type="number" inputMode="numeric" value={forma.a || ''} onChange={(e) => actualizar({ a: numero(e) })} className={inputDim} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Altura Recta (B)</label>
                        <input type="number" inputMode="numeric" value={forma.b || ''} onChange={(e) => actualizar({ b: numero(e) })} className={inputDim} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Altura Total (H)</label>
                        <input type="number" inputMode="numeric" value={forma.b1 || ''} onChange={(e) => actualizar({ b1: numero(e) })} className={inputDim} />
                      </div>
                    </>
                  )}
                  {shape === 'personalizada' && (
                    <div className="col-span-2 space-y-2">
                      <p className="text-[11px] text-slate-500 leading-snug">
                        Arrastre los puntos en el visualizador o escriba aquí su posición exacta. X se mide desde la izquierda e Y desde abajo.
                      </p>
                      <div className="grid grid-cols-[2rem_1fr_1fr_3.5rem_4rem] gap-1.5 items-center text-[10px] font-bold text-slate-400 uppercase">
                        <span>N°</span><span>X (mm)</span><span>Y (mm)</span><span className="text-right">Lado</span><span></span>
                      </div>
                      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                        {puntos.map((p, i) => (
                          <div
                            key={i}
                            className={`grid grid-cols-[2rem_1fr_1fr_3.5rem_4rem] gap-1.5 items-center rounded-lg ${puntoActivo === i ? 'bg-cyan-50 ring-1 ring-cyan-300' : ''}`}
                          >
                            <span className="text-xs font-bold text-slate-500 text-center">P{i + 1}</span>
                            <input
                              type="number" inputMode="numeric"
                              value={p.x}
                              onFocus={() => setPuntoActivo(i)}
                              onChange={(e) => updatePunto(i, 'x', numero(e))}
                              className="w-full min-w-0 px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-cyan-500"
                            />
                            <input
                              type="number" inputMode="numeric"
                              value={p.y}
                              onFocus={() => setPuntoActivo(i)}
                              onChange={(e) => updatePunto(i, 'y', numero(e))}
                              className="w-full min-w-0 px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-cyan-500"
                            />
                            <span className="text-[11px] font-mono text-slate-500 text-right" title={`Largo del lado P${i + 1} → P${((i + 1) % puntos.length) + 1}`}>
                              {Math.round(ladosPoligono(puntos)[i])}
                            </span>
                            <div className="flex justify-end gap-0.5">
                              <button
                                type="button"
                                onClick={() => insertarPunto(i)}
                                className="p-1.5 text-slate-400 hover:text-cyan-600 transition-colors"
                                title={`Agregar un punto entre P${i + 1} y P${((i + 1) % puntos.length) + 1}`}
                              >
                                <Plus size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => eliminarPunto(i)}
                                disabled={puntos.length <= 3}
                                className="p-1.5 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                                title="Eliminar punto"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between text-xs text-slate-500 pt-1 border-t border-slate-200">
                        <span>Ancho total: <strong className="text-slate-700">{bounding.w} mm</strong></span>
                        <span>Alto total: <strong className="text-slate-700">{bounding.h} mm</strong></span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* CRISTALES & SEPARADOR */}
              <div>
                <h3 className={tituloCls}>3. Configuración Vidrio</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Cristal 1 (Ext)</label>
                    <select value={cristal1.tipo} onChange={(e) => cambiarTipoCristal(cristal1, setCristal1, e.target.value)} className={`${selectCls} font-medium`}>
                      {tiposUnicos.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Espesor C1</label>
                    <select value={cristal1.espesor} onChange={(e) => setCristal1({ ...cristal1, espesor: parseInt(e.target.value) })} className={`${selectCls} text-center`}>
                      {getEspesores(cristal1.tipo, cristal1.espesor).map(t => <option key={t} value={t}>{t} mm</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Cristal 2 (Int)</label>
                    <select value={cristal2.tipo} onChange={(e) => cambiarTipoCristal(cristal2, setCristal2, e.target.value)} className={`${selectCls} font-medium`}>
                      {tiposUnicos.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Espesor C2</label>
                    <select value={cristal2.espesor} onChange={(e) => setCristal2({ ...cristal2, espesor: parseInt(e.target.value) })} className={`${selectCls} text-center`}>
                      {getEspesores(cristal2.tipo, cristal2.espesor).map(t => <option key={t} value={t}>{t} mm</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Espesor Sep.</label>
                    <select value={separador.espesor} onChange={(e) => setSeparador({ ...separador, espesor: parseInt(e.target.value) })} className={`${selectCls} text-center`}>
                      {espesoresSeparador.map(s => <option key={s} value={s}>{s} mm</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Color Sep.</label>
                    <select value={separador.color} onChange={(e) => setSeparador({ ...separador, color: e.target.value })} className={selectCls}>
                      {coloresSeparador.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* EXTRAS */}
              <div>
                <h3 className={tituloCls}>4. Extras</h3>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                  <div className="flex justify-around items-center flex-wrap gap-2">
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
                            type="number" inputMode="numeric" min="0"
                            value={palillajeHorizontales}
                            onChange={(e) => setPalillajeHorizontales(numero(e))}
                            className="border border-slate-200 rounded w-12 py-1 text-center font-bold outline-none"
                          />
                        </div>
                        <div className="flex items-center flex-1 justify-between">
                          <span className="font-semibold text-slate-500 mr-2">Verticales:</span>
                          <input
                            type="number" inputMode="numeric" min="0"
                            value={palillajeVerticales}
                            onChange={(e) => setPalillajeVerticales(numero(e))}
                            className="border border-slate-200 rounded w-12 py-1 text-center font-bold outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* REFERENCIA, CANTIDAD Y OBSERVACIÓN */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Ref. ventana</label>
                  <input type="text" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ej: V1" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Cantidad</label>
                  <input
                    type="number" inputMode="numeric" min="1"
                    value={cantidad || ''}
                    onChange={(e) => setCantidad(numero(e))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Observación (opcional)</label>
                  <input type="text" value={observacion} onChange={(e) => setObservacion(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>

            {/* VISUALIZADOR */}
            <div className="lg:col-span-7 space-y-4 lg:sticky lg:top-0">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative p-4 flex flex-col items-center">
                <div className="absolute top-4 left-4 bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 font-mono text-[10px] tracking-wider uppercase px-2.5 py-1 rounded-md shadow">
                  visualizador cad v1.0
                </div>

                {shape !== 'personalizada' ? (
                  <button
                    type="button"
                    onClick={handleEditarForma}
                    className="absolute top-3.5 right-4 flex items-center gap-1.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/40 text-orange-400 text-[11px] font-bold px-2.5 py-1 rounded-md transition-colors"
                    title="Convertir esta figura en una forma libre para mover, agregar o quitar puntos"
                  >
                    <Pencil size={12} /> Editar forma
                  </button>
                ) : (
                  <div className="absolute top-4 right-4 text-orange-400 font-mono text-[10px] tracking-wider uppercase">
                    modo edición
                  </div>
                )}

                <svg
                  className="w-full max-w-[420px] aspect-[4/3] bg-slate-900/40 rounded-xl border border-slate-800/80 mt-8 relative"
                  viewBox="0 0 400 300"
                  style={shape === 'personalizada' ? { touchAction: 'none' } : undefined}
                >
                  <defs>
                    <pattern id="cadGridFab" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke={shape === 'personalizada' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(6, 182, 212, 0.05)'} strokeWidth="1" />
                    </pattern>
                    <marker id="arrowCADFab" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#f97316" />
                    </marker>
                  </defs>

                  <rect width="400" height="300" fill="url(#cadGridFab)" />

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

                  {/* Cotas */}
                  {svgData.lines.map((line, idx) => (
                    <g key={idx}>
                      <line
                        x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
                        stroke="#f97316"
                        strokeWidth="1.5"
                        markerStart="url(#arrowCADFab)"
                        markerEnd="url(#arrowCADFab)"
                      />
                      <text
                        x={line.x1 === line.x2 ? (line.x1 < 200 ? line.x1 - 8 : line.x1 + 8) : (line.x1 + line.x2) / 2}
                        y={line.y1 === line.y2 ? (line.y1 > 150 ? line.y1 + 14 : line.y1 - 6) : (line.y1 + line.y2) / 2 + 4}
                        textAnchor={line.x1 === line.x2 ? (line.x1 < 200 ? "end" : "start") : "middle"}
                        fill="#f97316"
                        stroke="#020617"
                        strokeWidth="3px"
                        paintOrder="stroke"
                        className="font-mono text-[11px] font-bold"
                      >
                        {line.label}
                      </text>
                    </g>
                  ))}

                  {/* Editor de forma libre */}
                  {customGeo && (
                    <g>
                      <path
                        d={customGeo.path}
                        fill="rgba(6, 182, 212, 0.04)"
                        stroke="#06b6d4"
                        strokeWidth="3"
                        strokeLinejoin="round"
                        className="drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]"
                      />
                      {customGeo.lados.filter(l => l.visible).map(l => (
                        <g key={`lado-${l.idx}`}>
                          <text
                            x={l.lx}
                            y={l.ly}
                            textAnchor="middle"
                            fill="#f97316"
                            stroke="#020617"
                            strokeWidth="3px"
                            paintOrder="stroke"
                            className="font-mono text-[10px] font-bold pointer-events-none select-none"
                          >
                            {l.label}
                          </text>
                          {!dragView && (
                            <g onClick={() => insertarPunto(l.idx)} className="cursor-pointer">
                              <title>Agregar punto en este lado</title>
                              <circle cx={l.mx} cy={l.my} r="10" fill="transparent" />
                              <circle cx={l.mx} cy={l.my} r="5" fill="#0f172a" stroke="#06b6d4" strokeWidth="1" />
                              <path d={`M ${l.mx - 2.5},${l.my} L ${l.mx + 2.5},${l.my} M ${l.mx},${l.my - 2.5} L ${l.mx},${l.my + 2.5}`} stroke="#06b6d4" strokeWidth="1.2" />
                            </g>
                          )}
                        </g>
                      ))}
                      {customGeo.verts.map((p, i) => (
                        <g
                          key={`punto-${i}`}
                          onPointerDown={(e) => handleVertexPointerDown(e, i)}
                          onPointerMove={handleVertexPointerMove}
                          onPointerUp={handleVertexPointerUp}
                          onPointerCancel={handleVertexPointerUp}
                          onDoubleClick={() => eliminarPunto(i)}
                          className="cursor-move"
                          style={{ touchAction: 'none' }}
                        >
                          <circle cx={p.x} cy={p.y} r="14" fill="transparent" />
                          <circle cx={p.x} cy={p.y} r={puntoActivo === i ? 6.5 : 5} fill={puntoActivo === i ? '#f97316' : '#06b6d4'} stroke="#020617" strokeWidth="1.5" />
                        </g>
                      ))}
                    </g>
                  )}
                </svg>

                {shape === 'personalizada' && (
                  <div className="w-full max-w-[420px] flex items-center justify-between gap-2 mt-3 min-h-[34px]">
                    <span className="text-[11px] font-mono text-slate-400">
                      {puntoActivo !== null && puntos[puntoActivo]
                        ? `P${puntoActivo + 1} seleccionado (X ${puntos[puntoActivo].x}, Y ${puntos[puntoActivo].y})`
                        : 'Toque un punto para seleccionarlo'}
                    </span>
                    <button
                      type="button"
                      onClick={() => puntoActivo !== null && eliminarPunto(puntoActivo)}
                      disabled={puntoActivo === null || puntos.length <= 3}
                      className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-bold px-3 py-1.5 rounded-md transition-colors disabled:opacity-30 disabled:pointer-events-none"
                      title={puntos.length <= 3 ? 'La figura necesita al menos 3 puntos' : 'Eliminar el punto seleccionado'}
                    >
                      <Trash2 size={13} /> Eliminar punto
                    </button>
                  </div>
                )}

                <div className="w-full flex justify-between text-[11px] font-mono text-slate-500 mt-4 px-2">
                  <span>{shape === 'personalizada' ? 'Arrastre los puntos · + agrega un punto' : 'Status: Ready'}</span>
                  <span>Units: Milimeters (mm)</span>
                </div>
              </div>

              {/* RESUMEN */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid grid-cols-3 gap-3 text-xs">
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-400 block mb-0.5">Medida total</span>
                  <strong className="text-slate-700 text-sm">{bounding.w} x {bounding.h} mm</strong>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-400 block mb-0.5">Área Real</span>
                  <strong className="text-slate-700 text-sm">{areaM2(forma).toFixed(3)} m²</strong>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-400 block mb-0.5">Perímetro Real</span>
                  <strong className="text-slate-700 text-sm">{perimetroMl(forma).toFixed(3)} ml</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pie */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 bg-white border-t border-slate-200 flex-shrink-0">
          <p className="text-xs text-red-600 font-medium">{error}</p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={onCancelar} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button onClick={handleGuardar} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors">
              <Check size={15} /> {esNueva ? 'Agregar medida' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
