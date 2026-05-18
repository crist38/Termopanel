export interface TermopanelItem {
  id: string
  cantidad: number
  ancho: number // mm
  alto: number // mm
  cristal1: { tipo: string; espesor: number }
  cristal2: { tipo: string; espesor: number }
  separador: { espesor: number; color: string }
  gas: boolean
  micropersiana: boolean
  palillaje: boolean
  precioUnitario: number
}

export function calcularItem(item: TermopanelItem): {
  metrosCuadrados: number
  totalLinea: number
} {
  // Convertir mm a m: (ancho/1000) * (alto/1000) = m2
  // => (ancho * alto) / 1,000,000
  const metrosCuadrados = (item.ancho * item.alto) / 1_000_000

  const totalLinea = item.precioUnitario * item.cantidad

  return {
    metrosCuadrados,
    totalLinea
  }
}

export function calcularTotal(items: TermopanelItem[]) {
  const totalNeto = items.reduce((acc, item) => {
    return acc + (item.precioUnitario * item.cantidad)
  }, 0)

  return totalNeto
}
