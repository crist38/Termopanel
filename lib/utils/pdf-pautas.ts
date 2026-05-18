import jsPDF from 'jspdf';
import {
    getPautaAL25_Corredera2H,
    getPautaAL5000_Corredera2H,
    getPautaAL20_Corredera2H,
    getPautaAL42_Proyectante,
    getPautaAL12_Shower2H,
    PautaCorte
} from '../data/aluminio_perfiles';

export const inferColorName = (color: string = ''): string => {
    const c = color.toLowerCase();
    if (c === 'white' || c === '#ffffff') return 'Blanco';
    if (c === 'black' || c === '#111827') return 'Negro';
    if (c === 'matte' || c === '#c4c4c4') return 'Mate';
    if (c === 'titanium' || c === '#9d9181') return 'Titanio';
    if (c === 'walnut' || c === '#8a5a3a') return 'Nogal';
    if (c === 'golden_oak' || c === '#b58149') return 'Roble Dorado';
    return color; // Retornar tal cual si es desconocido (podría estar ya traducido)
};

/**
 * Infiere el código de línea basado en el nombre guardado (soporte legacy)
 */
export const inferLineCode = (lineName: string = ''): string => {
    const name = lineName.toLowerCase();
    if (name.includes('al 25') || name.includes('al-25')) return 'al_25';
    if (name.includes('al 5000') || name.includes('al-5000')) return 'al_5000';
    if (name.includes('al 20') || name.includes('al-20')) return 'al_20';
    if (name.includes('al 42') || name.includes('al-42')) return 'al_42';
    if (name.includes('al 32') || name.includes('al-32')) return 'al_32';
    if (name.includes('am 35') || name.includes('am-35')) return 'am_35';
    if (name.includes('al 12') || name.includes('al-12') || name.includes('shower')) return 'al_12';
    return '';
};

/**
 * Obtiene la pauta técnica si existe para la combinación de línea y tipo
 */
export const getTechnicalPauta = (lineCode: string, windowType: string, width: number, height: number): PautaCorte | null => {
    const type = windowType.toLowerCase();

    if (lineCode === 'al_25' && type === 'corredera') return getPautaAL25_Corredera2H(width, height);
    if (lineCode === 'al_5000' && type === 'corredera') return getPautaAL5000_Corredera2H(width, height);
    if (lineCode === 'al_20' && type === 'corredera') return getPautaAL20_Corredera2H(width, height);
    if (lineCode === 'al_42' && type === 'proyectante') return getPautaAL42_Proyectante(width, height);
    if (lineCode === 'al_12' && type === 'shower_door') return getPautaAL12_Shower2H(width, height);

    return null;
};

/**
 * Renderiza una pauta de corte en el documento PDF
 */
export const renderPautaToPDF = (
    pdf: jsPDF,
    pauta: PautaCorte,
    currentY: number,
    margin: number,
    pageWidth: number,
    pageHeight: number,
    titlePrefix: string = "PAUTA DE CORTE",
    profileColor: string = ""
): number => {
    let y = currentY;

    // Título de la pauta - V2.1 (Para verificar actualización)
    y += 5;
    if (y + 50 > pageHeight - 20) {
        pdf.addPage();
        y = 20;
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(0, 0, 0);
    pdf.text(`${titlePrefix}:`, margin, y);
    y += 5;

    // Encabezados de tabla
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100);
    pdf.text("Perfil", margin, y);
    pdf.text("Cant", margin + 60, y);
    pdf.text("Largo (mm)", margin + 80, y);
    pdf.text("Fórmula", margin + 110, y);
    y += 4;
    pdf.setDrawColor(200);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 4;

    // Filas de perfiles
    pdf.setTextColor(0);
    pdf.setFont('helvetica', 'normal');
    pauta.perfiles.forEach(p => {
        if (y + 5 > pageHeight - 20) {
            pdf.addPage();
            y = 20;
        }
        pdf.text(`${p.codigo} - ${p.nombre}`, margin, y);
        pdf.text(`${p.cantidad}`, margin + 60, y);
        pdf.text(`${Math.round(p.largo)}`, margin + 80, y);
        pdf.text(p.formula || '', margin + 110, y);
        y += 4;
    });

    // Vidrios
    y += 2;
    if (y + 10 > pageHeight - 20) {
        pdf.addPage();
        y = 20;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.text("VIDRIOS / PANELES:", margin, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${pauta.vidrios.cantidad} unidades: ${Math.round(pauta.vidrios.ancho)} x ${Math.round(pauta.vidrios.alto)} mm`, margin + 35, y);
    y += 5;

    // Quincallería y Accesorios (Lógica Reforzada)
    const w = Number(pauta.width) || 0;
    const h = Number(pauta.height) || 0;
    const areaM2 = (w * h) / 1000000;
    const siliconeTubes = Math.max(1, Math.ceil(areaM2 / 8));
    const friendlyColor = inferColorName(profileColor);
    const colorSuffix = friendlyColor ? ` (${friendlyColor})` : "";

    const siliconeItem = {
        nombre: `Silicona${colorSuffix}`,
        cantidad: siliconeTubes,
        unidad: 'Tubo(s)'
    };

    // Asegurar que quincalleria sea un array y añadir silicona
    const baseQuincalleria = Array.isArray(pauta.quincalleria) ? pauta.quincalleria : [];
    const finalQuincalleria = [...baseQuincalleria, siliconeItem];

    if (finalQuincalleria.length > 0) {
        if (y + 10 > pageHeight - 20) {
            pdf.addPage();
            y = 20;
        }
        pdf.setFont('helvetica', 'bold');
        pdf.text("QUINCALLERÍA / ACCESORIOS:", margin, y);
        y += 4;
        pdf.setFont('helvetica', 'normal');

        finalQuincalleria.forEach(q => {
            if (y + 5 > pageHeight - 20) {
                pdf.addPage();
                y = 20;
            }
            // Usar String() para evitar problemas con números o NaN
            const qty = isNaN(Number(q.cantidad)) ? 1 : q.cantidad;
            pdf.text(`- ${q.nombre}: ${qty} ${q.unidad}`, margin + 5, y);
            y += 4;
        });
    }

    y += 4;
    pdf.setDrawColor(240);
    pdf.line(margin, y, pageWidth - margin, y);

    return y;
};
