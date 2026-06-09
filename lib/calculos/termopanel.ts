export interface TermopanelItem {
  id: string
  label?: string
  cantidad: number
  ancho: number // mm
  alto: number // mm
  cristal1: { tipo: string; espesor: number }
  cristal2: { tipo: string; espesor: number }
  separador: { espesor: number; color: string }
  gas: boolean
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
  /** Costo de butilo + sales deshidratantes por metro lineal de separador */
  costoButiloSalesPorMl: number       // default: 361.59 CLP/ml
  /** Factor de pérdida de insumos de maquila (aplica sobre maquila) */
  factorPerdida: number               // default: 0.12 (12%)
  /** Factor de gastos generales + overhead sobre costos totales */
  factorGG: number                    // default: 1.11 (111% sobre costo)
  /** Factor de precio de venta sobre el costo con GG (margen de utilidad) */
  factorVenta: number                 // default: 1.9584
  /** Costo adicional por gas argón (por unidad) */
  costoGasArgon: number               // default: 1300 CLP
  /** Costo de mano de obra (por m2) */
  costoManoDeObra: number             // default: 1650 CLP
}

export const PARAMETROS_DEFAULT: ParametrosCalculo = {
  costoButiloSalesPorMl: 361.59,
  factorPerdida: 0.12,
  factorGG: 1.11,
  factorVenta: 1.9584,
  costoGasArgon: 1300,
  costoManoDeObra: 1650,
}

/**
 * Calcula el Precio Unitario de un termopanel según la fórmula del Excel.
 *
 * Fórmula:
 *   m2 = (ancho × alto) / 1_000_000
 *   ml = 2 × (ancho + alto) / 1_000
 *   C1 = precio_cristal1_por_m2 × m2
 *   C2 = precio_cristal2_por_m2 × m2
 *   Maquila = (costo_butilo_sales + precio_separador_por_ml) × ml
 *   Perdida = Maquila × factor_perdida
 *   Base    = C1 + C2 + Maquila + Perdida + extras
 *   ColGG   = Base × factor_GG
 *   PU      = ColGG × factor_venta
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
  const maquila = (params.costoButiloSalesPorMl + precioSeparadorPorMl) * ml
  const perdida = maquila * params.factorPerdida
  const manoDeObra = (params.costoManoDeObra || 1650) * m2

  let base = C1 + C2 + maquila + perdida + manoDeObra

  // Extras
  if (item.gas) base += params.costoGasArgon

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
