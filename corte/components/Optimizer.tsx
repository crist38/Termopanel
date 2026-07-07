"use strict";
"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Box, RefreshCw, Monitor, Layers, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Item, SheetResult, packMultipleSheets } from "@/lib/packer";
import jsPDF from "jspdf";

// --- Types ---
type SheetSize = {
    w: number;
    h: number;
};

// --- Components ---

function InputSection({
    items,
    onAddItem,
    onRemoveItem,
    onUpdateItem,
    sheetSize,
    setSheetSize,
    onExportPDF,
    hasResults
}: {
    items: Item[];
    onAddItem: () => void;
    onRemoveItem: (id: string) => void;
    onUpdateItem: (id: string, field: keyof Item, value: any) => void;
    sheetSize: SheetSize;
    setSheetSize: (s: SheetSize) => void;
    onExportPDF: () => void;
    hasResults: boolean;
}) {
    return (
        <div className="space-y-6 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
            <div>
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                    <Monitor className="w-5 h-5 text-cyan-500" />
                    Dimensión de la Plancha
                </h2>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-medium uppercase text-slate-500">Ancho (mm)</label>
                        <input
                            type="number"
                            value={sheetSize.w}
                            onChange={(e) => setSheetSize({ ...sheetSize, w: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg border-0 focus:ring-2 focus:ring-cyan-500 transition-all font-mono"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium uppercase text-slate-500">Alto (mm)</label>
                        <input
                            type="number"
                            value={sheetSize.h}
                            onChange={(e) => setSheetSize({ ...sheetSize, h: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg border-0 focus:ring-2 focus:ring-cyan-500 transition-all font-mono"
                        />
                    </div>
                </div>
            </div>

            <div className="h-px bg-slate-100 dark:bg-slate-800" />

            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Box className="w-5 h-5 text-indigo-500" />
                        Piezas de Corte
                    </h2>
                    <button
                        onClick={onAddItem}
                        className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                        title="Agregar Pieza"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {/* Header row */}
                    <div className="flex gap-3 px-1">
                        <label className="flex-1 text-[10px] font-bold uppercase text-slate-400">Ancho</label>
                        <label className="flex-1 text-[10px] font-bold uppercase text-slate-400">Alto</label>
                        <label className="w-16 text-[10px] font-bold uppercase text-slate-400 text-center">Cant.</label>
                        <div className="w-8"></div>
                    </div>

                    {items.map((item, idx) => (
                        <div
                            key={item.id}
                            className="group flex gap-3 items-center animate-in slide-in-from-left-2 duration-300 fill-mode-both"
                            style={{ animationDelay: `${idx * 50}ms` }}
                        >
                            <div className="flex-1">
                                <input
                                    type="number"
                                    value={item.w}
                                    onChange={(e) => onUpdateItem(item.id, "w", Number(e.target.value))}
                                    className="w-full px-2 py-1.5 text-sm bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-indigo-500 font-mono"
                                    placeholder="W"
                                />
                            </div>
                            <div className="flex-1">
                                <input
                                    type="number"
                                    value={item.h}
                                    onChange={(e) => onUpdateItem(item.id, "h", Number(e.target.value))}
                                    className="w-full px-2 py-1.5 text-sm bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-indigo-500 font-mono"
                                    placeholder="H"
                                />
                            </div>
                            <div className="w-16">
                                <input
                                    type="number"
                                    min={1}
                                    value={item.quantity || 1}
                                    onChange={(e) => onUpdateItem(item.id, "quantity", Math.max(1, Number(e.target.value)))}
                                    className="w-full px-2 py-1.5 text-sm bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-indigo-500 font-mono text-center"
                                />
                            </div>
                            <button
                                onClick={() => onRemoveItem(item.id)}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors w-8 flex justify-center"
                                title="Eliminar"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}

                    {items.length === 0 && (
                        <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
                            Sin piezas agregadas.
                        </div>
                    )}
                </div>
            </div>

            <button
                onClick={onExportPDF}
                disabled={!hasResults}
                className="w-full py-3 px-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Download className="w-5 h-5" />
                Exportar a PDF
            </button>
        </div>
    );
}

function StatsCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center">
            <span className="text-slate-500 text-xs uppercase font-bold tracking-wider mb-1">{label}</span>
            <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</span>
            {sub && <span className="text-xs text-slate-400 mt-1">{sub}</span>}
        </div>
    );
}

function Visualizer({ sheetResult }: { sheetResult: SheetResult }) {
    const { width, height, placedItems } = sheetResult;
    // SVG ViewBox
    const viewBox = `0 0 ${width} ${height}`;

    return (
        <div className="w-full bg-slate-100 dark:bg-slate-950/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex items-center justify-center overflow-hidden relative min-h-[700px] lg:min-h-[850px]">
            <div className="absolute top-4 right-4 text-xs font-mono text-slate-400 bg-white dark:bg-slate-900 px-2 py-1 rounded shadow-sm z-10">
                {width} x {height} mm
            </div>

            <div className="relative w-full h-full flex items-center justify-center shadow-2xl shadow-slate-200 dark:shadow-black/50 transition-all duration-500 ease-in-out">
                <svg
                    viewBox={viewBox}
                    className="max-w-full max-h-[85vh] bg-white dark:bg-[#1a1a1a] transition-all"
                    style={{
                        aspectRatio: `${width}/${height}`,
                        width: '100%',
                        height: 'auto'
                    }}
                >
                    {/* Grid lines or texture for glass effect? */}
                    <rect x="0" y="0" width={width} height={height} fill="none" strokeWidth="4" className="stroke-slate-900 dark:stroke-slate-100" />

                    {placedItems.map((item, idx) => (
                        <g key={item.id + idx} className="group cursor-pointer hover:opacity-90 transition-opacity">
                            <rect
                                x={item.x}
                                y={item.y}
                                width={item.w}
                                height={item.h}
                                className="fill-cyan-100 dark:fill-cyan-900/40 stroke-cyan-500 dark:stroke-cyan-500 stroke-[2px]"
                            />
                            <text
                                x={item.x + item.w / 2}
                                y={item.y + item.h / 2}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className="fill-cyan-900 dark:fill-cyan-100 text-[10px] sm:text-xs font-mono pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ fontSize: Math.min(item.w, item.h) * 0.2 }}
                            >
                                {Math.round(item.w)}x{Math.round(item.h)}
                            </text>
                        </g>
                    ))}
                </svg>
            </div>
        </div>
    );
}

export function Optimizer() {
    const [sheetSize, setSheetSize] = useState<SheetSize>({ w: 3600, h: 2500 });
    const [items, setItems] = useState<Item[]>([]);

    const [sheets, setSheets] = useState<SheetResult[]>([]);
    const [currentSheetIndex, setCurrentSheetIndex] = useState(0);

    useEffect(() => {
        // Debounce optimization
        const timer = setTimeout(() => {
            // Expand items based on quantity
            const expandedItems: Item[] = [];
            items.forEach(item => {
                const qty = item.quantity || 1;
                for (let i = 0; i < qty; i++) {
                    expandedItems.push({ ...item, id: `${item.id}_${i}` });
                }
            });

            const results = packMultipleSheets(sheetSize.w, sheetSize.h, expandedItems);
            setSheets(results);

            // Reset index if out of bounds
            if (currentSheetIndex >= results.length) {
                setCurrentSheetIndex(0);
            }
        }, 100);
        return () => clearTimeout(timer);
    }, [items, sheetSize]); // Removed currentSheetIndex dependency to avoid loop

    const addNewItem = () => {
        setItems(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), w: 500, h: 500, quantity: 1 }]);
    };

    const removeItem = (id: string) => {
        setItems(prev => prev.filter(i => i.id !== id));
    };

    const updateItem = (id: string, field: keyof Item, value: any) => {
        let newValue = value;
        if (typeof newValue === "number" && (field === "w" || field === "h")) {
            // Apply limits based on sheet size
            if (field === "w" && newValue > sheetSize.w) newValue = sheetSize.w;
            if (field === "h" && newValue > sheetSize.h) newValue = sheetSize.h;
        }
        setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: newValue } : i));
    };

    const generatePDF = () => {
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        // A4 Landscape: 297 x 210 mm
        const pageWidth = 297;
        const pageHeight = 210;
        const margin = 10;
        const startY = 30;
        const maxDrawWidth = pageWidth - (margin * 2);
        const maxDrawHeight = pageHeight - startY - margin;

        sheets.forEach((sheet, index) => {
            if (index > 0) doc.addPage();

            // Header
            doc.setFontSize(16);
            doc.text(`GlassOpt - Pauta de Corte ${index + 1}/${sheets.length}`, margin, 15);

            doc.setFontSize(10);
            doc.text(`Plancha: ${sheet.width}x${sheet.height}mm | Aprovechamiento: ${(sheet.stats.usage * 100).toFixed(1)}% | Piezas: ${sheet.stats.placedCount}`, margin, 22);

            // Scale calculation
            // Try to fit width
            let scale = maxDrawWidth / sheet.width;
            if (sheet.height * scale > maxDrawHeight) {
                scale = maxDrawHeight / sheet.height;
            }

            const drawX = (pageWidth - (sheet.width * scale)) / 2;
            const drawY = startY;

            // Draw Sheet Outline
            doc.setDrawColor(0);
            doc.setLineWidth(1); // Thicker border
            doc.rect(drawX, drawY, sheet.width * scale, sheet.height * scale);

            // Draw Items
            doc.setLineWidth(0.2);
            sheet.placedItems.forEach(item => {
                const x = drawX + (item.x * scale);
                const y = drawY + (item.y * scale);
                const w = item.w * scale;
                const h = item.h * scale;

                // Fill logic? Maybe just rect
                doc.rect(x, y, w, h);

                // Text centered
                if (w > 10 && h > 5) {
                    doc.setFontSize(8);
                    const label = `${Math.round(item.w)}x${Math.round(item.h)}`;
                    const textWidth = doc.getTextWidth(label);
                    // Check if fit
                    if (textWidth < w) {
                        doc.text(label, x + (w / 2) - (textWidth / 2), y + (h / 2) + 1);
                    }
                }
            });
        });

        doc.save("pautas_vidrio_optimizadas.pdf");
    };

    const currentSheet = sheets[currentSheetIndex];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Sidebar Input */}
            <div className="lg:col-span-4 space-y-6">
                <InputSection
                    items={items}
                    onAddItem={addNewItem}
                    onRemoveItem={removeItem}
                    onUpdateItem={updateItem}
                    sheetSize={sheetSize}
                    setSheetSize={setSheetSize}
                    onExportPDF={generatePDF}
                    hasResults={sheets.length > 0}
                />

                <div className="bg-gradient-to-br from-cyan-600 to-blue-700 rounded-2xl p-6 text-white shadow-lg">
                    <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-pulse" />
                        Optimización en Vivo
                    </h3>
                    <p className="text-cyan-100 text-sm opacity-90">
                        La distribución se actualiza automáticamente.
                        Algoritmo optimizado para cortes de bordes completos.
                    </p>
                </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-8 space-y-6">
                {currentSheet ? (
                    <>
                        <div className="grid grid-cols-3 gap-4">
                            <StatsCard label="Aprovechamiento" value={`${(currentSheet.stats.usage * 100).toFixed(1)}%`} sub="Area Usada" />
                            <StatsCard label="Piezas" value={`${currentSheet.stats.placedCount}`} sub="En esta plancha" />
                            <StatsCard label="Desperdicio" value={`${(currentSheet.stats.waste * 100).toFixed(1)}%`} sub="Total" />
                        </div>

                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-2 flex items-center justify-between">
                            <button
                                onClick={() => setCurrentSheetIndex(Math.max(0, currentSheetIndex - 1))}
                                disabled={currentSheetIndex === 0}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>

                            <div className="flex items-center gap-2 font-medium">
                                <Layers className="w-4 h-4 text-cyan-500" />
                                <span>Plancha {currentSheetIndex + 1} de {sheets.length}</span>
                            </div>

                            <button
                                onClick={() => setCurrentSheetIndex(Math.min(sheets.length - 1, currentSheetIndex + 1))}
                                disabled={currentSheetIndex === sheets.length - 1}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>

                        <Visualizer sheetResult={currentSheet} />
                    </>
                ) : (
                    <div className="h-[500px] flex items-center justify-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                        Calculando...
                    </div>
                )}
            </div>
        </div>
    );
}
