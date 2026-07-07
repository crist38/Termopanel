
export type Rect = {
    x: number;
    y: number;
    w: number;
    h: number;
};

export type Item = {
    id: string;
    w: number;
    h: number;
    label?: string;
    color?: string;
    quantity?: number; // Agregado para manejo de UI, aunque el packer expande items
};

export type PlacedItem = Rect & {
    id: string;
    label?: string;
    color?: string;
};

export type SheetResult = {
    padding: number; // Por si queremos márgenes futuros
    width: number;
    height: number;
    placedItems: PlacedItem[];
    stats: {
        usage: number; // 0-1
        waste: number;
        placedCount: number;
    }
};

export class GuillotinePacker {
    binWidth: number;
    binHeight: number;
    freeRects: Rect[] = [];
    placedItems: PlacedItem[] = [];

    constructor(width: number, height: number) {
        this.binWidth = width;
        this.binHeight = height;
        this.freeRects.push({ x: 0, y: 0, w: width, h: height });
    }

    // Heurística: Mejor Ajuste de Área (Best Area Fit)
    // Encuentra el rectángulo libre que se ajusta al ítem con el menor desperdicio
    private findNode(w: number, h: number): Rect | null {
        let bestRect: Rect | null = null;
        let bestAreaFit = Number.MAX_VALUE;
        let bestShortSideFit = Number.MAX_VALUE;

        for (const freeRect of this.freeRects) {
            // Intentar colocar el ítem en orientación normal
            // Nota: Podríamos intentar rotar (w/h intercambiados), pero para ciertas vetas o tipos de vidrio quizás no se desee.
            // Asumiremos rotación permitida si el usuario lo quisiera, pero por defecto probaremos el ajuste directo aquí.
            // (Para vidrio float normal, la rotación suele ser válida).

            // Ajuste Directo
            if (freeRect.w >= w && freeRect.h >= h) {
                const areaFit = freeRect.w * freeRect.h - w * h;
                const shortSideFit = Math.min(freeRect.w - w, freeRect.h - h);

                if (areaFit < bestAreaFit || (areaFit === bestAreaFit && shortSideFit < bestShortSideFit)) {
                    bestRect = freeRect;
                    bestAreaFit = areaFit;
                    bestShortSideFit = shortSideFit;
                }
            }
        }
        return bestRect;
    }

    /* 
     * Divide el rectángulo libre en dos nuevos rectángulos libres después de colocar un ítem.
     * Reglas de Guillotina: 
     * - El corte debe ir de un extremo al otro del rectángulo libre actual.
     * - Decidimos si cortar Horizontalmente o Verticalmente.
     * - Heurística: Maximizar el rectángulo libre restante más grande (o dividir por el eje más corto).
     */
    private splitFreeNode(freeRect: Rect, usedNode: Rect): void {
        // Si ajusta perfecto, no hay sobrante.
        if (usedNode.w === freeRect.w && usedNode.h === freeRect.h) {
            return;
        }

        const w = usedNode.w;
        const h = usedNode.h;

        // Sobrantes si cortamos verticalmente primero
        const rightW = freeRect.w - w;
        const bottomH = freeRect.h - h;

        // Decisión de corte: Cortar a lo largo del eje más corto del sobrante para maximizar el otro.
        let splitHorizontal = freeRect.w < freeRect.h;

        // Un enfoque robusto:
        if (rightW > bottomH) {
            splitHorizontal = false; // Corte vertical deja pieza ancha a la derecha
        } else {
            splitHorizontal = true;
        }

        if (splitHorizontal) {
            // Corte Horizontal (Eje Y)
            // Abajo (Bottom) y Derecha (Right)
            const bottom = { x: freeRect.x, y: freeRect.y + h, w: freeRect.w, h: bottomH };
            const right = { x: freeRect.x + w, y: freeRect.y, w: rightW, h: h };

            if (bottom.w > 0 && bottom.h > 0) this.freeRects.push(bottom);
            if (right.w > 0 && right.h > 0) this.freeRects.push(right);

        } else {
            // Corte Vertical (Eje X)
            const right = { x: freeRect.x + w, y: freeRect.y, w: rightW, h: freeRect.h };
            const bottom = { x: freeRect.x, y: freeRect.y + h, w: w, h: bottomH };

            if (right.w > 0 && right.h > 0) this.freeRects.push(right);
            if (bottom.w > 0 && bottom.h > 0) this.freeRects.push(bottom);
        }
    }

    /**
     * Intenta empaquetar una lista de ítems en esta plancha.
     * Devuelve los ítems que NO pudieron ser colocados.
     */
    public pack(items: Item[]): Item[] {
        const remainingItems: Item[] = [];

        // Ordenar: Área descendente es una buena heurística general.
        const sortedItems = [...items].sort((a, b) => (b.w * b.h) - (a.w * a.h));

        for (const item of sortedItems) {
            const node = this.findNode(item.w, item.h);
            if (node) {
                const placed: PlacedItem = {
                    ...node,
                    w: item.w,
                    h: item.h,
                    id: item.id,
                    label: item.label,
                    color: item.color
                };
                this.placedItems.push(placed);

                // Eliminar el rectángulo libre usado
                const index = this.freeRects.indexOf(node);
                if (index > -1) {
                    this.freeRects.splice(index, 1);
                }

                this.splitFreeNode(node, placed);
            } else {
                remainingItems.push(item);
            }
        }
        return remainingItems;
    }

    public getStats() {
        const placedArea = this.placedItems.reduce((acc, item) => acc + (item.w * item.h), 0);
        const totalArea = this.binWidth * this.binHeight;
        return {
            usage: placedArea / totalArea,
            placedCount: this.placedItems.length,
            waste: 1 - (placedArea / totalArea)
        };
    }
}

/**
 * Función helper para empaquetar en múltiples planchas.
 * Intenta llenar una plancha, y lo que sobra lo pasa a la siguiente.
 */
export function packMultipleSheets(
    binWidth: number,
    binHeight: number,
    items: Item[]
): SheetResult[] {
    const sheets: SheetResult[] = [];
    let currentItems = [...items];

    // Protección contra bucles infinitos si un ítem es más grande que la plancha
    // Filtramos ítems imposibles primero
    const impossibleItems = currentItems.filter(i => i.w > binWidth || i.h > binHeight);
    if (impossibleItems.length > 0) {
        console.warn(`${impossibleItems.length} ítems son más grandes que la plancha y serán ignorados.`);
        // Podríamos devolverlos en una lista de errores, pero por ahora solo filtramos.
        currentItems = currentItems.filter(i => i.w <= binWidth && i.h <= binHeight);
    }

    let safetyCounter = 0;
    // Mientras haya ítems y no hayamos creado demasiadas planchas (seguridad)
    while (currentItems.length > 0 && safetyCounter < 100) {
        const packer = new GuillotinePacker(binWidth, binHeight);

        // Packer devuelve lo que NO pudo meter
        const remaining = packer.pack(currentItems);

        sheets.push({
            width: binWidth,
            height: binHeight,
            placedItems: packer.placedItems,
            stats: packer.getStats(),
            padding: 0
        });

        // Si no se pudo colocar NINGÚN ítem pero hay pendientes, algo anda mal (quizás bug de fitting o item muy grande que pasó el filtro).
        // Para evitar bucle infinito, si remaining.length == currentItems.length, break.
        if (remaining.length === currentItems.length && remaining.length > 0) {
            console.error("No se pudo colocar ningún ítem en una plancha vacía. Abortando para evitar bucle infinito.");
            break;
        }

        currentItems = remaining;
        safetyCounter++;
    }

    return sheets;
}
