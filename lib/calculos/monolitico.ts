export interface MonoliticoItem {
  id: string;
  label?: string; // V1, V2...
  cantidad: number;
  ancho: number;
  alto: number;
  cristal: {
    tipo: string;
    espesor: number;
  };
  precioUnitario: number;
}

export function calcularItemMonolitico(
  ancho: number,
  alto: number,
  precioMetroCuadrado: number
) {
  // Las medidas están en milímetros
  const areaMetroCuadrado = (ancho * alto) / 1_000_000;
  
  // Precio de este cristal según su área
  const costoCristal = areaMetroCuadrado * precioMetroCuadrado;

  // Total neto por 1 unidad
  const totalNeto = Math.round(costoCristal);

  return {
    area: areaMetroCuadrado,
    totalLinea: totalNeto
  };
}

export function calcularTotalMonolitico(items: MonoliticoItem[]) {
  const total = items.reduce((sum, item) => sum + (item.precioUnitario * item.cantidad), 0);
  return total;
}
