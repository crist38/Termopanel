'use server'

import { odoo } from '@/lib/odoo';
import { getSession } from '@/app/actions/auth';
import {
  PiezaReposicion,
  ReposicionGuardada,
  REPOSICION_FILE,
  escribirReposicion,
  leerReposicion,
  m2Pieza,
  parsearLineaVenta,
} from '@/lib/reposiciones';

const TICKET_FIELDS = ['id', 'name', 'ticket_ref', 'partner_id', 'user_id', 'team_id', 'stage_id', 'create_date', 'sale_order_id'];

function escapeHtml(text: string) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Número de venta escrito en el asunto del ticket (ej. "s00481" → "S00481")
function ventaEnAsunto(asunto: string): string | null {
  const m = String(asunto || '').match(/\bS\d{3,}\b/i);
  return m ? m[0].toUpperCase() : null;
}

// Venta ligada al ticket: el campo "Ref. Sales Order" o, si está vacío, el número escrito en el asunto
async function ventaDelTicket(ticket: any): Promise<{ id: number; name: string } | null> {
  if (Array.isArray(ticket.sale_order_id)) {
    return { id: ticket.sale_order_id[0], name: ticket.sale_order_id[1] };
  }
  const nombre = ventaEnAsunto(ticket.name);
  if (!nombre) return null;
  const orders = await odoo.executeKw('sale.order', 'search_read', [[['name', '=ilike', nombre]]], {
    fields: ['id', 'name'],
    limit: 1,
  });
  return orders.length > 0 ? { id: orders[0].id, name: orders[0].name } : null;
}

export interface TicketReposicionResumen {
  id: number;
  name: string;
  ticketRef: string;
  cliente: string;
  asignado: string;
  etapa: string;
  stageId: number | null;
  creado: string;
  venta: string | null;
  m2Reposicion: number | null;
}

/**
 * Lista los tickets de Soporte al Cliente con la reposición registrada (si la hay).
 */
export async function listarTicketsReposicion(busqueda = ''): Promise<{
  exito: boolean;
  tickets?: TicketReposicionResumen[];
  error?: string;
}> {
  try {
    const session = await getSession();
    if (!session) return { exito: false, error: 'No autorizado' };

    const q = busqueda.trim();
    const domain: any[] = q
      ? ['|', '|', '|', ['name', 'ilike', q], ['partner_id.name', 'ilike', q], ['ticket_ref', 'ilike', q], ['sale_order_id.name', 'ilike', q]]
      : [];
    const tickets = await odoo.executeKw('helpdesk.ticket', 'search_read', [domain], {
      fields: TICKET_FIELDS,
      order: 'id desc',
      limit: 100,
    });

    const ids = tickets.map((t: any) => t.id);
    const m2PorTicket = new Map<number, number>();
    if (ids.length > 0) {
      const adjuntos = await odoo.executeKw(
        'ir.attachment',
        'search_read',
        [[['res_model', '=', 'helpdesk.ticket'], ['res_id', 'in', ids], ['name', '=', REPOSICION_FILE]]],
        { fields: ['res_id', 'datas'], order: 'id desc' }
      );
      for (const a of adjuntos) {
        if (m2PorTicket.has(a.res_id)) continue;
        try {
          const rep: ReposicionGuardada = JSON.parse(Buffer.from(a.datas, 'base64').toString('utf8'));
          m2PorTicket.set(a.res_id, (rep.items || []).reduce((s, i) => s + (i.m2 || 0), 0));
        } catch {
          // Adjunto ilegible: se muestra como sin reposición
        }
      }
    }

    return {
      exito: true,
      tickets: tickets.map((t: any) => ({
        id: t.id,
        name: t.name || '',
        ticketRef: t.ticket_ref || String(t.id),
        cliente: Array.isArray(t.partner_id) ? t.partner_id[1] : '—',
        asignado: Array.isArray(t.user_id) ? t.user_id[1] : '—',
        etapa: Array.isArray(t.stage_id) ? t.stage_id[1] : '—',
        stageId: Array.isArray(t.stage_id) ? t.stage_id[0] : null,
        creado: t.create_date || '',
        venta: Array.isArray(t.sale_order_id) ? t.sale_order_id[1] : ventaEnAsunto(t.name),
        m2Reposicion: m2PorTicket.has(t.id) ? m2PorTicket.get(t.id)! : null,
      })),
    };
  } catch (error: any) {
    console.error('Error al listar tickets de soporte:', error);
    return { exito: false, error: error.message || 'Error al conectar con Odoo.' };
  }
}

export interface DetalleTicketReposicion {
  ticket: TicketReposicionResumen;
  venta: { id: number; name: string; cliente: string; partnerId: number | null; fecha: string; state: string } | null;
  piezas: Omit<PiezaReposicion, 'cantidad' | 'm2'>[];
  etapas: { id: number; name: string }[];
  reposicion: ReposicionGuardada | null;
}

/**
 * Detalle del ticket: la venta ligada con sus termopaneles/monolíticos y la reposición guardada.
 */
export async function obtenerTicketReposicion(ticketId: number): Promise<{
  exito: boolean;
  data?: DetalleTicketReposicion;
  error?: string;
}> {
  try {
    const session = await getSession();
    if (!session) return { exito: false, error: 'No autorizado' };

    const tickets = await odoo.executeKw('helpdesk.ticket', 'read', [[ticketId]], { fields: TICKET_FIELDS });
    if (!tickets || tickets.length === 0) return { exito: false, error: 'Ticket no encontrado' };
    const t = tickets[0];

    const [etapas, guardado, ventaRef] = await Promise.all([
      odoo.executeKw('helpdesk.stage', 'search_read', [[]], { fields: ['id', 'name'], order: 'sequence, id' }),
      leerReposicion(ticketId),
      ventaDelTicket(t),
    ]);

    let venta: DetalleTicketReposicion['venta'] = null;
    let piezas: DetalleTicketReposicion['piezas'] = [];
    if (ventaRef) {
      const orders = await odoo.executeKw('sale.order', 'read', [[ventaRef.id]], {
        fields: ['id', 'name', 'partner_id', 'date_order', 'state', 'order_line'],
      });
      const o = orders?.[0];
      if (o) {
        venta = {
          id: o.id,
          name: o.name,
          cliente: Array.isArray(o.partner_id) ? o.partner_id[1] : '—',
          partnerId: Array.isArray(o.partner_id) ? o.partner_id[0] : null,
          fecha: o.date_order || '',
          state: o.state,
        };
        if (o.order_line?.length) {
          const lines = await odoo.executeKw('sale.order.line', 'read', [o.order_line], {
            fields: ['id', 'name', 'product_id', 'product_uom_qty', 'display_type', 'x_studio_ancho_m', 'x_studio_alto_m'],
          });
          piezas = lines
            .filter((l: any) => !l.display_type)
            .map((l: any, i: number) => parsearLineaVenta(l, i))
            .filter((p: any): p is NonNullable<typeof p> => !!p);
        }
      }
    }

    return {
      exito: true,
      data: {
        ticket: {
          id: t.id,
          name: t.name || '',
          ticketRef: t.ticket_ref || String(t.id),
          cliente: Array.isArray(t.partner_id) ? t.partner_id[1] : '—',
          asignado: Array.isArray(t.user_id) ? t.user_id[1] : '—',
          etapa: Array.isArray(t.stage_id) ? t.stage_id[1] : '—',
          stageId: Array.isArray(t.stage_id) ? t.stage_id[0] : null,
          creado: t.create_date || '',
          venta: ventaRef?.name ?? null,
          m2Reposicion: guardado.reposicion ? guardado.reposicion.items.reduce((s, i) => s + i.m2, 0) : null,
        },
        venta,
        piezas,
        etapas,
        reposicion: guardado.reposicion,
      },
    };
  } catch (error: any) {
    console.error('Error al obtener ticket de soporte:', error);
    return { exito: false, error: error.message || 'Error al conectar con Odoo.' };
  }
}

function notaReposicionHtml(rep: ReposicionGuardada) {
  const td = 'style="border:1px solid #ccc;padding:3px 8px;"';
  const filas = rep.items.map(i =>
    '<tr>' +
    `<td ${td}>${escapeHtml(i.ref)}</td>` +
    `<td ${td}>${i.tipo === 'termopanel' ? 'Termopanel' : 'Monolítico'}</td>` +
    `<td ${td}>${i.ancho} x ${i.alto}</td>` +
    `<td ${td}>${i.cantidad}</td>` +
    `<td ${td}>${i.m2.toFixed(2)}</td>` +
    '</tr>'
  ).join('');
  const total = rep.items.reduce((s, i) => s + i.m2, 0);
  return `<p><b>Reposición registrada</b> por ${escapeHtml(rep.updatedBy)} — venta ${escapeHtml(rep.orderName)}, fecha ${escapeHtml(rep.fecha)}</p>` +
    (rep.motivo ? `<p><b>Motivo:</b> ${escapeHtml(rep.motivo)}</p>` : '') +
    `<table style="border-collapse:collapse;"><tr><th ${td}>Ref</th><th ${td}>Tipo</th><th ${td}>Medida (mm)</th><th ${td}>Cant.</th><th ${td}>m²</th></tr>${filas}</table>` +
    `<p><b>Total:</b> ${total.toFixed(2)} m² — se suman a la producción de los talleres.</p>`;
}

/**
 * Guarda en el ticket las piezas que se reponen. Sus m² se suman a la producción de los
 * talleres (y a la mano de obra) en Reportes, en la fecha indicada.
 */
export async function guardarReposicion(
  ticketId: number,
  datos: { cantidades: Record<number, number>; motivo: string; fecha: string; stageId?: number | null }
): Promise<{ exito: boolean; aviso?: string; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { exito: false, error: 'No autorizado' };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha || '')) return { exito: false, error: 'Fecha inválida.' };

    const detalle = await obtenerTicketReposicion(ticketId);
    if (!detalle.exito || !detalle.data) return { exito: false, error: detalle.error };
    const { ticket, venta, piezas, etapas } = detalle.data;
    if (!venta) {
      return { exito: false, error: 'El ticket no tiene una venta ligada. Escribe el N° de venta en el asunto (ej. S00481) o en "Ref. Sales Order".' };
    }

    const items: PiezaReposicion[] = [];
    for (const p of piezas) {
      const cantidad = Math.round(Number(datos.cantidades?.[p.lineId]) || 0);
      if (cantidad <= 0) continue;
      if (cantidad > p.cantidadVenta) {
        return { exito: false, error: `La pieza ${p.ref} tiene ${p.cantidadVenta} unidad(es) en la venta; no se pueden reponer ${cantidad}.` };
      }
      if (p.ancho <= 0 || p.alto <= 0) {
        return { exito: false, error: `La pieza ${p.ref} no tiene medidas válidas en la venta.` };
      }
      items.push({ ...p, cantidad, m2: m2Pieza(p.ancho, p.alto, cantidad) });
    }
    if (items.length === 0) return { exito: false, error: 'Indica al menos una pieza a reponer.' };

    const contenido: ReposicionGuardada = {
      ticketId,
      orderId: venta.id,
      orderName: venta.name,
      partnerId: venta.partnerId,
      partnerName: venta.cliente,
      fecha: datos.fecha,
      motivo: String(datos.motivo || '').trim().slice(0, 300),
      items,
      updatedAt: new Date().toISOString(),
      updatedBy: session.email,
    };

    const guardado = await leerReposicion(ticketId);
    await escribirReposicion(ticketId, guardado.adjuntoId, contenido);

    // Ligar la venta al ticket y mover la etapa si se pidió
    const cambios: Record<string, any> = {};
    const tickets = await odoo.executeKw('helpdesk.ticket', 'read', [[ticketId]], { fields: ['sale_order_id'] });
    if (!Array.isArray(tickets?.[0]?.sale_order_id)) cambios.sale_order_id = venta.id;
    if (datos.stageId && datos.stageId !== ticket.stageId && etapas.some(e => e.id === datos.stageId)) {
      cambios.stage_id = datos.stageId;
    }

    const avisos: string[] = [];
    if (Object.keys(cambios).length > 0) {
      try {
        await odoo.executeKw('helpdesk.ticket', 'write', [[ticketId], cambios]);
      } catch (e: any) {
        console.error('Error al actualizar el ticket:', e);
        avisos.push('no se pudo actualizar la etapa o la venta del ticket');
      }
    }

    try {
      await odoo.executeKw('helpdesk.ticket', 'message_post', [[ticketId]], {
        body: notaReposicionHtml(contenido),
        body_is_html: true,
        message_type: 'comment',
        subtype_xmlid: 'mail.mt_note',
      });
    } catch (e: any) {
      console.error('Error al publicar la nota de reposición:', e);
      avisos.push('no se pudo publicar la nota en el historial del ticket');
    }

    return avisos.length > 0
      ? { exito: true, aviso: `La reposición se guardó, pero ${avisos.join(' y ')}.` }
      : { exito: true };
  } catch (error: any) {
    console.error('Error al guardar la reposición:', error);
    return { exito: false, error: error.message || 'Error al conectar con Odoo.' };
  }
}
