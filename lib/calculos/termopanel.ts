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
}

/**
 * Parámetros de la fórmula de cálculo, editables desde la configuración.
 * Basados en la fórmula del Excel original.
 */
export interface ParametrosCalculo {
  /** Costo de butilo + sales deshidratantes por metro lineal (obsoleto) */
  costoButiloSalesPorMl?: number
  /** Costo de butilo por metro lineal (CLP/ml) */
  costoButilo: number
  /** Costo de sal higroscópica por metro lineal (CLP/ml) */
  costoSalHigroscopica: number
  /** Costo de hotmelt por metro lineal (CLP/ml) */
  costoHotmelt: number
  /** Costo de escuadra por unidad (CLP/ud) */
  costoEscuadra: number
  /** Factor de pérdida de insumos de maquila (aplica sobre maquila) */
  factorPerdida: number               // default: 0.12 (12%)
  /** Factor de gastos generales + overhead sobre costos totales */
  factorGG: number                    // default: 1.11 (111% sobre costo)
  /** Factor de precio de venta sobre el costo con GG (margen de utilidad) */
  factorVenta: number                 // default: 1.9584
  /** Costo adicional por pulido (por unidad) */
  costoPulido: number                 // default: 1300 CLP
  /** Costo de mano de obra (por m2) */
  costoManoDeObra: number             // default: 1650 CLP
  /** Costo de la tira de palillaje (CLP) */
  costoTiraPalillaje?: number
  /** Largo de la tira de palillaje (mm) */
  largoTiraPalillaje?: number
  /** Costo extra de mano de obra por complejidad del palillaje (CLP) */
  costoManoObraPalillaje?: number
  /** Recargo porcentual por fabricar termopanel con forma (ej: 50 para +50%) */
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

/**
 * Calcula el Precio Unitario de un termopanel según la fórmula del Excel.
 */
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

export function calcularItem(item: TermopanelItem): {
  metrosCuadrados: number
  totalLinea: number
} {
  let metrosCuadrados = (item.ancho * item.alto) / 1_000_000
  if (item.conForma && item.tipoFigura && item.medidasFigura) {
    const med = item.medidasFigura
    if (item.tipoFigura === 'triangulo') {
      metrosCuadrados = ((med.a || 0) * (med.b || 0)) / 2_000_000
    } else if (item.tipoFigura === 'trapecio') {
      metrosCuadrados = (med.a || 0) * (((med.b1 || 0) + (med.b2 || 0)) / 2) / 1_000_000
    } else if (item.tipoFigura === 'arco') {
      metrosCuadrados = ((med.a || 0) * (med.b || 0) + (Math.PI * Math.pow((med.a || 0) / 2, 2)) / 2) / 1_000_000
    } else if (item.tipoFigura === 'medio_arco') {
      const hArch = Math.max(0, (med.b1 || 0) - (med.b || 0))
      metrosCuadrados = ((med.a || 0) * (med.b || 0) + (Math.PI * (med.a || 0) * hArch) / 4) / 1_000_000
    } else if (item.tipoFigura === 'circulo') {
      metrosCuadrados = (Math.PI * Math.pow((med.a || 0) / 2, 2)) / 1_000_000
    }
  }
  const totalLinea = item.precioUnitario * item.cantidad
  return { metrosCuadrados, totalLinea }
}

export function calcularTotal(items: TermopanelItem[]) {
  return items.reduce((acc, item) => acc + item.precioUnitario * item.cantidad, 0)
}
