const fs = require('fs');

// Fix termopanel.ts
const tpPath = 'lib/calculos/termopanel.ts';
let tpContent = fs.readFileSync(tpPath, 'utf8');

const termopanelFinal = 
export interface MaterialesCompra {
  vidrios: { tipo: string; espesor: number; planchasNormales: number; planchasJumbo: number; area: number }[];
  separadoresMts: number;
  separadoresTiras: number;
  escuadras: number;
  salKg: number;
  salCajas: number;
  hotmeltKg: number;
  hotmeltCajas: number;
  butiloKg: number;
}

export function calcularInsumosCompra(items: TermopanelItem[]): MaterialesCompra {
  const vidriosMap = new Map<string, { tipo: string; espesor: number; areaNormal: number; areaJumbo: number }>();
  let separadoresMts = 0;
  let escuadras = 0;

  for (const item of items) {
    if (item.ancho <= 0 || item.alto <= 0 || item.cantidad <= 0) continue;

    const areaM2 = (item.ancho * item.alto) / 1000000;
    const totalArea = areaM2 * item.cantidad;
    const perimetroMts = ((item.ancho * 2 + item.alto * 2) / 1000) * item.cantidad;
    
    const MAX_NORMAL_ANCHO = 1830;
    const MAX_NORMAL_ALTO = 2440;
    
    const cabeNormal = (item.ancho <= MAX_NORMAL_ANCHO && item.alto <= MAX_NORMAL_ALTO) ||
                       (item.ancho <= MAX_NORMAL_ALTO && item.alto <= MAX_NORMAL_ANCHO);

    const key1 = \\_\\;
    if (!vidriosMap.has(key1)) vidriosMap.set(key1, { tipo: item.cristal1.tipo, espesor: item.cristal1.espesor, areaNormal: 0, areaJumbo: 0 });
    const v1 = vidriosMap.get(key1);
    if (cabeNormal) v1.areaNormal += totalArea; else v1.areaJumbo += totalArea;

    const key2 = \\_\\;
    if (!vidriosMap.has(key2)) vidriosMap.set(key2, { tipo: item.cristal2.tipo, espesor: item.cristal2.espesor, areaNormal: 0, areaJumbo: 0 });
    const v2 = vidriosMap.get(key2);
    if (cabeNormal) v2.areaNormal += totalArea; else v2.areaJumbo += totalArea;

    separadoresMts += perimetroMts;
    escuadras += 4 * item.cantidad;
  }

  const AREA_NORMAL = 4.4652;
  const AREA_JUMBO = 8.25;

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

  return {
    vidrios,
    separadoresMts,
    separadoresTiras,
    escuadras,
    salKg: salCajas * 25,
    salCajas,
    hotmeltKg: hotmeltCajas * 7,
    hotmeltCajas,
    butiloKg
  };
}
;

// Remove everything after calcularTotal and append the correct version
const cutIndex = tpContent.indexOf('export interface MaterialesCompra');
if (cutIndex !== -1) {
  tpContent = tpContent.substring(0, cutIndex) + termopanelFinal;
} else {
  tpContent += termopanelFinal;
}
fs.writeFileSync(tpPath, tpContent);

// Fix odoo.ts
const odooPath = 'app/actions/odoo.ts';
let odooContent = fs.readFileSync(odooPath, 'utf8');

const imports = import { getSession } from '@/app/actions/auth';
import { odoo } from '@/lib/odoo';
import { odooPurchases } from '@/lib/odoo-purchases';
import { calcularInsumosCompra } from '@/lib/calculos/termopanel';

async function _crearComprasTermopanel(items: any[], originName: string) {
  try {
    const insumos = calcularInsumosCompra(items);
    
    // 1. Pedido a Alar (Vidrios)
    if (insumos.vidrios.length > 0) {
      const vendorAlarId = await odooPurchases.getOrCreateVendor('Alar');
      const linesAlar = [];
      for (const v of insumos.vidrios) {
        if (v.planchasNormales > 0) {
          const prodName = \Plancha \ \mm (1830x2440)\;
          const productId = await odooPurchases.getOrCreateProduct(prodName);
          linesAlar.push({ productId, name: prodName, qty: v.planchasNormales });
        }
        if (v.planchasJumbo > 0) {
          const prodName = \Plancha Jumbo \ \mm (3300x2500)\;
          const productId = await odooPurchases.getOrCreateProduct(prodName);
          linesAlar.push({ productId, name: prodName, qty: v.planchasJumbo });
        }
      }
      if (linesAlar.length > 0) {
        await odooPurchases.createPurchaseOrder(vendorAlarId, linesAlar, \Suministro de Cristales - \\);
      }
    }

    // 2. Pedido a Soluex (Insumos)
    const linesSoluex = [];
    
    if (insumos.hotmeltCajas > 0) {
      const prodName = 'Hotmelt Kömmerling 7kg';
      const productId = await odooPurchases.getOrCreateProduct(prodName);
      linesSoluex.push({ productId, name: prodName, qty: insumos.hotmeltCajas });
    }
    
    if (insumos.butiloKg > 0) {
      const prodName = 'Butilo 1kg';
      const productId = await odooPurchases.getOrCreateProduct(prodName);
      linesSoluex.push({ productId, name: prodName, qty: insumos.butiloKg });
    }
    
    if (insumos.salCajas > 0) {
      const prodName = 'Sal Higroscópica 1mm (Caja 25kg)';
      const productId = await odooPurchases.getOrCreateProduct(prodName);
      linesSoluex.push({ productId, name: prodName, qty: insumos.salCajas });
    }

    if (insumos.separadoresTiras > 0) {
      const prodName = 'Separador Tira 5 mts';
      const productId = await odooPurchases.getOrCreateProduct(prodName);
      linesSoluex.push({ productId, name: prodName, qty: insumos.separadoresTiras });
    }
    
    if (insumos.escuadras > 0) {
      const prodName = 'Escuadra para Termopanel';
      const productId = await odooPurchases.getOrCreateProduct(prodName);
      linesSoluex.push({ productId, name: prodName, qty: insumos.escuadras });
    }

    if (linesSoluex.length > 0) {
      const vendorSoluexId = await odooPurchases.getOrCreateVendor('Soluex');
      await odooPurchases.createPurchaseOrder(vendorSoluexId, linesSoluex, \Suministro de Insumos - \\);
    }

  } catch (error) {
    console.error('Error creando Pedidos de Compra automáticos:', error);
  }
}
;

odooContent = odooContent.replace("import { getSession } from '@/app/actions/auth';\r\nimport { odoo } from '@/lib/odoo';", imports);
odooContent = odooContent.replace("import { getSession } from '@/app/actions/auth';\nimport { odoo } from '@/lib/odoo';", imports);

const searchCreate = 'const odooQuote = await odooSales.createQuote(clienteId, lineas, rawItems, autoConfirm, data.clientName, userId, finalNote);';
const replaceCreate = searchCreate + '\n\n    if (autoConfirm) {\n      await _crearComprasTermopanel(data.items, odooQuote.name);\n    }';
odooContent = odooContent.replace(searchCreate, replaceCreate);

const searchUpdate = 'const odooQuote = await odooSales.updateQuote(data.orderId, data.clientId, lineas, rawItems, autoConfirm, data.clientName, finalNote);';
const replaceUpdate = searchUpdate + '\n\n    if (autoConfirm) {\n      await _crearComprasTermopanel(data.items, odooQuote.name);\n    }';
odooContent = odooContent.replace(searchUpdate, replaceUpdate);

fs.writeFileSync(odooPath, odooContent);
console.log("Success");
