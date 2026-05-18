export interface Vidrio {
    codigo: string;
    tipo: string;
    espesor: number;
    precio: number;
}

export const PRECIOS_VIDRIOS: Vidrio[] = [
    // Incoloro
    { tipo: "Incoloro", codigo: "inc.3", espesor: 3, precio: 7000 },
    { tipo: "Incoloro", codigo: "inc.4", espesor: 4, precio: 9500 },
    { tipo: "Incoloro", codigo: "inc.5", espesor: 5, precio: 12500 },
    { tipo: "Incoloro", codigo: "inc.6", espesor: 6, precio: 18000 },
    { tipo: "Incoloro", codigo: "inc.8", espesor: 8, precio: 32000 },
    { tipo: "Incoloro", codigo: "inc.10", espesor: 10, precio: 38000 },

    // Bronce
    { tipo: "Bronce", codigo: "br.4", espesor: 4, precio: 19900 },
    { tipo: "Bronce", codigo: "br.5", espesor: 5, precio: 24650 },
    { tipo: "Bronce", codigo: "br.6", espesor: 6, precio: 29900 },

    // Espejo
    { tipo: "Espejo", codigo: "esp.4", espesor: 4, precio: 19900 },

    // Saten
    { tipo: "Saten", codigo: "Saten4", espesor: 4, precio: 26950 },
    { tipo: "Saten", codigo: "Saten5", espesor: 5, precio: 32450 },

    // Semilla
    { tipo: "Semilla", codigo: "sem.4", espesor: 4, precio: 12000 },
    { tipo: "Semilla Bronce", codigo: "sembr.4", espesor: 4, precio: 19900 }, // Assumed "sembr" is Semilla Bronce

    // Laminado
    { tipo: "Laminado", codigo: "lam.5", espesor: 5, precio: 18000 },
    { tipo: "Laminado", codigo: "lam.6", espesor: 6, precio: 22000 },
    { tipo: "Laminado", codigo: "lam.8", espesor: 8, precio: 28000 },
    { tipo: "Laminado", codigo: "lam.10", espesor: 10, precio: 49900 },

    // Otros
    { tipo: "Evergreen", codigo: "evergr.4", espesor: 4, precio: 35000 },
    { tipo: "Solar Cool BR.", codigo: "solcool.4", espesor: 4, precio: 29900 },
    { tipo: "Solar Green", codigo: "solgreen.4", espesor: 4, precio: 50000 },

    // Reflex
    { tipo: "Reflex Bronce", codigo: "RFloat4", espesor: 4, precio: 29900 },
    { tipo: "Reflex Bronce", codigo: "RFloat5", espesor: 5, precio: 39900 },

    // Bluegreen
    { tipo: "Bluegreen", codigo: "bluegreen.6", espesor: 6, precio: 39900 },

    // Templado
    { tipo: "Templado", codigo: "tem.10", espesor: 10, precio: 69900 },

    // Emp. (Empavonado?)
    { tipo: "Empavonado", codigo: "Emp.4", espesor: 4, precio: 26950 },
    { tipo: "Empavonado", codigo: "Emp.5", espesor: 5, precio: 32450 },
];

// Helper to get unique types
export const TIPOS_UNICOS = Array.from(new Set(PRECIOS_VIDRIOS.map(v => v.tipo)));

// Flattened list for easy selection if needed
export const VIDRIOS_FLAT = PRECIOS_VIDRIOS.map(v => ({
    label: `${v.tipo} ${v.espesor}mm`,
    value: v.codigo,
    price: v.precio
}));
