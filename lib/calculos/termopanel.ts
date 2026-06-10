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

  const m2 = (item.ancho * item.alto) / 1_000_000
  const ml = 2 * (item.ancho + item.alto) / 1_000

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
  const metrosCuadrados = (item.ancho * item.alto) / 1_000_000
  const totalLinea = item.precioUnitario * item.cantidad
  return { metrosCuadrados, totalLinea }
}

export function calcularTotal(items: TermopanelItem[]) {
  return items.reduce((acc, item) => acc + item.precioUnitario * item.cantidad, 0)
}
