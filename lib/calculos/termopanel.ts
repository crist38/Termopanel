export interface TermopanelItem {
  id: string
  label?: string
  cantidad: number
  ancho: number // mm
  alto: number // mm
  cristal1: { tipo: string; espesor: number }
  cristal2: { tipo: string; espesor: number }
  separador: { espesor: number; color: string }
  pulido: boolean
  micropersiana: boolean
  palillaje: boolean
  palillajeColor?: string
  palillajeHorizontales?: number
  palillajeVerticales?: number
  conForma?: boolean
  tipoFigura?: 'rectangulo' | 'triangulo' | 'trapecio' | 'arco' | 'medio_arco' | 'circulo'
  medidasFigura?: { a: number; b: number; b1?: number; b2?: number }
  descuento?: number // Porcentaje de descuento (0-100)
  precioUnitario: number
  esPrecioManual?: boolean
}

/**
 * Parámetros de la fórmula de cálculo, editables desde la configuración.
 * Basados en la fórmula del Excel original.
 */
export interface ParametrosCalculo {
  costoButiloSalesPorMl?: number
  costoButilo: number
  costoSalHigroscopica: number
  costoHotmelt: number
  costoEscuadra: number
  factorPerdida: number               // default: 0.12 (12%)
  factorGG: number                    // default: 1.11 (111% sobre costo)
  factorVenta: number                 // default: 1.9584
  costoPulido: number                 // default: 1300 CLP
  costoManoDeObra: number             // default: 1650 CLP
  costoTiraPalillaje?: number
  largoTiraPalillaje?: number
  costoManoObraPalillaje?: number
  recargoPorcentajeForma?: number
}

export const PARAMETROS_DEFAULT: ParametrosCalculo = {
  costoButilo: 150,
  costoSalHigroscopica: 100,
  costoHotmelt: 111.59,
  costoEscuadra: 100,
  factorPerdida: 0.12,
  factorGG: 1.11,
  factorVenta: 1.9584,
  costoPulido: 1300,
  costoManoDeObra: 1650,
  costoTiraPalillaje: 30000,
  largoTiraPalillaje: 5000,
  costoManoObraPalillaje: 10000,
  recargoPorcentajeForma: 50,
}

export function calcularItem(item: TermopanelItem): {
  metrosCuadrados: number
  totalLinea: number
} {
  let metrosCuadrados = (item.ancho * item.alto) / 1_000_000
  if (item.conForma && item.tipoFigura && item.medidasFigura) {
    const med = item.medidasFigura
    if (item.tipoFigura === 'triangulo') {
      const a = med.a || 0
      const b = med.b || 0
      metrosCuadrados = (a * b) / 2_000_000
    } else if (item.tipoFigura === 'trapecio') {
      const a = med.a || 0
      const b1 = med.b1 || 0
      const b2 = med.b2 || 0
      metrosCuadrados = a * (((b1 + b2) / 2)) / 1_000_000
    } else if (item.tipoFigura === 'arco') {
      const a = med.a || 0
      const b = med.b || 0
      metrosCuadrados = (a * b + (Math.PI * Math.pow(a / 2, 2)) / 2) / 1_000_000
    } else if (item.tipoFigura === 'medio_arco') {
      const a = med.a || 0
      const b = med.b || 0
      const b1 = med.b1 || 0
      const hArch = Math.max(0, b1 - b)
      metrosCuadrados = (a * b + (Math.PI * a * hArch) / 4) / 1_000_000
    } else if (item.tipoFigura === 'circulo') {
      const a = med.a || 0
      metrosCuadrados = (Math.PI * Math.pow(a / 2, 2)) / 1_000_000
    }
  }
  const totalLinea = item.precioUnitario * item.cantidad
  return { metrosCuadrados, totalLinea }
}

export function calcularPrecioUnitario(
  item: TermopanelItem,
  precioCristal1: number,      // CLP/m²
  precioCristal2: number,      // CLP/m²
  precioSeparadorPorMl: number, // CLP/ml
  params: ParametrosCalculo = PARAMETROS_DEFAULT
): number {
  if (item.ancho <= 0 || item.alto <= 0) return 0

  let m2 = (item.ancho * item.alto) / 1_000_000
  let ml = 2 * (item.ancho + item.alto) / 1_000

  if (item.conForma && item.tipoFigura && item.medidasFigura) {
    const med = item.medidasFigura
    if (item.tipoFigura === 'triangulo') {
      const a = med.a || 0
      const b = med.b || 0
      m2 = (a * b) / 2_000_000
      ml = (a + b + Math.sqrt(a * a + b * b)) / 1000
    } else if (item.tipoFigura === 'trapecio') {
      const a = med.a || 0
      const b1 = med.b1 || 0
      const b2 = med.b2 || 0
      m2 = a * ((b1 + b2) / 2) / 1_000_000
      ml = (a + b1 + b2 + Math.sqrt(a * a + Math.pow(Math.abs(b1 - b2), 2))) / 1000
    } else if (item.tipoFigura === 'arco') {
      const a = med.a || 0
      const b = med.b || 0
      m2 = (a * b + (Math.PI * Math.pow(a / 2, 2)) / 2) / 1_000_000
      ml = (a + 2 * b + (Math.PI * a) / 2) / 1000
    } else if (item.tipoFigura === 'medio_arco') {
      const a = med.a || 0
      const b = med.b || 0
      const b1 = med.b1 || 0
      const hArch = Math.max(0, b1 - b)
      m2 = (a * b + (Math.PI * a * hArch) / 4) / 1_000_000
      const arcLength = (Math.PI * Math.sqrt(2 * (a * a + hArch * hArch))) / 4
      ml = (a + b + b1 + arcLength) / 1000
    } else if (item.tipoFigura === 'circulo') {
      const a = med.a || 0
      m2 = (Math.PI * Math.pow(a / 2, 2)) / 1_000_000
      ml = (Math.PI * a) / 1000
    }
  }

  const C1 = precioCristal1 * m2
  const C2 = precioCristal2 * m2

  const costoButilo = params.costoButilo !== undefined ? params.costoButilo : 150
  const costoSal = params.costoSalHigroscopica !== undefined ? params.costoSalHigroscopica : 100
  const costoHm = params.costoHotmelt !== undefined ? params.costoHotmelt : 111.59
  const costoEsc = params.costoEscuadra !== undefined ? params.costoEscuadra : 100

  const maquila = (costoButilo + costoSal + costoHm + precioSeparadorPorMl) * ml
  const perdida = maquila * params.factorPerdida
  const manoDeObra = (params.costoManoDeObra || 1650) * m2
  const costoEscuadras = costoEsc * 4

  let base = C1 + C2 + maquila + perdida + manoDeObra + costoEscuadras

  // Extras (Pulido en lugar de Gas Argón)
  if (item.pulido) {
    base += params.costoPulido !== undefined ? params.costoPulido : 1300
  }

  // Extra Palillaje
  if (item.palillaje) {
    const h = item.palillajeHorizontales || 0
    const v = item.palillajeVerticales || 0
    const longMm = (h * item.ancho) + (v * item.alto)
    const largoTira = params.largoTiraPalillaje || 5000
    const costoTira = params.costoTiraPalillaje || 30000
    const manoObraPali = params.costoManoObraPalillaje || 10000

    const tiras = Math.ceil(longMm / largoTira)
    const costoPalillaje = (tiras * costoTira) + manoObraPali
    base += costoPalillaje
  }

  // Recargo Con Forma
  if (item.conForma) {
    const recargoFactor = 1 + (params.recargoPorcentajeForma !== undefined ? params.recargoPorcentajeForma : 50) / 100
    base = base * recargoFactor
  }

  const colGG = base * params.factorGG
  let pu = colGG * params.factorVenta

  if (item.descuento && item.descuento > 0) {
    pu = pu * (1 - item.descuento / 100)
  }

  return Math.round(pu)
}

export function calcularTotal(items: TermopanelItem[]) {
  return items.reduce((acc, item) => acc + item.precioUnitario * item.cantidad, 0)
}

export interface MaterialesCompra {
  vidrios: { tipo: string; espesor: number; planchasNormales: number; planchasJumbo: number; area: number }[];
  separadoresMts: number;
  separadoresTiras: number;
  separadoresDetalle: { espesor: number; color: string; mts: number; tiras: number }[];
  escuadras: number;
  escuadrasDetalle: { espesor: number; cantidad: number }[];
  salKg: number;
  salCajas: number;
  hotmeltKg: number;
  hotmeltCajas: number;
  butiloKg: number;
}

export function calcularInsumosCompra(items: TermopanelItem[]): MaterialesCompra {
  // Mapa agrupado por tipo_espesor
  const vidriosMap = new Map<string, { tipo: string; espesor: number; areaNormal: number; areaJumbo: number }>();
  const separadoresMap = new Map<string, { espesor: number; color: string; mts: number }>();
  const escuadrasMap = new Map<number, number>();
  
  let separadoresMts = 0;
  let escuadras = 0;

  for (const item of items) {
    if (item.ancho <= 0 || item.alto <= 0 || item.cantidad <= 0) continue;

    const areaM2 = (item.ancho * item.alto) / 1000000;
    const totalArea = areaM2 * item.cantidad;
    const perimetroMts = ((item.ancho * 2 + item.alto * 2) / 1000) * item.cantidad;
    
    // Determinar si cabe en plancha normal (1830x2440) o requiere Jumbo (3300x2500)
    const MAX_NORMAL_ANCHO = 1830;
    const MAX_NORMAL_ALTO = 2440;
    
    // El vidrio puede rotarse, asi que verificamos ambas orientaciones
    const cabeNormal = (item.ancho <= MAX_NORMAL_ANCHO && item.alto <= MAX_NORMAL_ALTO) ||
                       (item.ancho <= MAX_NORMAL_ALTO && item.alto <= MAX_NORMAL_ANCHO);

    const key1 = `${item.cristal1.tipo}_${item.cristal1.espesor}`;
    if (!vidriosMap.has(key1)) vidriosMap.set(key1, { tipo: item.cristal1.tipo, espesor: item.cristal1.espesor, areaNormal: 0, areaJumbo: 0 });
    const v1 = vidriosMap.get(key1)!;
    if (cabeNormal) v1.areaNormal += totalArea; else v1.areaJumbo += totalArea;

    const key2 = `${item.cristal2.tipo}_${item.cristal2.espesor}`;
    if (!vidriosMap.has(key2)) vidriosMap.set(key2, { tipo: item.cristal2.tipo, espesor: item.cristal2.espesor, areaNormal: 0, areaJumbo: 0 });
    const v2 = vidriosMap.get(key2)!;
    if (cabeNormal) v2.areaNormal += totalArea; else v2.areaJumbo += totalArea;

    separadoresMts += perimetroMts;
    escuadras += 4 * item.cantidad;
    
    // Agrupar separadores por espesor y color
    const sepKey = `${item.separador.espesor}_${item.separador.color}`;
    if (!separadoresMap.has(sepKey)) {
      separadoresMap.set(sepKey, { espesor: item.separador.espesor, color: item.separador.color, mts: 0 });
    }
    separadoresMap.get(sepKey)!.mts += perimetroMts;

    // Agrupar escuadras por espesor de separador
    const currentEscuadras = escuadrasMap.get(item.separador.espesor) || 0;
    escuadrasMap.set(item.separador.espesor, currentEscuadras + 4 * item.cantidad);
  }

  // Planchas
  const AREA_NORMAL = 4.4652; // 1.83 * 2.44
  const AREA_JUMBO = 8.25;    // 3.30 * 2.50

  const vidrios = Array.from(vidriosMap.values()).map(v => ({
    tipo: v.tipo,
    espesor: v.espesor,
    area: v.areaNormal + v.areaJumbo,
    planchasNormales: Math.ceil(v.areaNormal / AREA_NORMAL),
    planchasJumbo: Math.ceil(v.areaJumbo / AREA_JUMBO)
  }));

  const separadoresTiras = Math.ceil(separadoresMts / 5);

  const SAL_REND_CAJA = 800; 
  const salCajas = Math.ceil(separadoresMts / SAL_REND_CAJA);
  
  const HOTMELT_REND_CAJA = 480;
  const hotmeltCajas = Math.ceil(separadoresMts / HOTMELT_REND_CAJA);
  
  const BUTILO_REND_KG = 145;
  const butiloKg = Math.ceil(separadoresMts / BUTILO_REND_KG);

  const separadoresDetalle = Array.from(separadoresMap.values()).map(s => ({
    ...s,
    tiras: Math.ceil(s.mts / 5)
  }));
  
  const escuadrasDetalle = Array.from(escuadrasMap.entries()).map(([espesor, cantidad]) => ({
    espesor,
    cantidad
  }));

  return {
    vidrios,
    separadoresMts,
    separadoresTiras,
    separadoresDetalle,
    escuadras,
    escuadrasDetalle,
    salKg: salCajas * 25,
    salCajas,
    hotmeltKg: hotmeltCajas * 7,
    hotmeltCajas,
    butiloKg
  };
}
