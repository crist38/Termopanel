// Copia usuarios, clientes/proveedores, categorías y productos desde Odoo a la base propia.
// Se puede correr varias veces: actualiza lo ya importado (por odoo_id) y agrega lo nuevo.
// No borra nada ni escribe en Odoo.
//
// Uso: npm run importar-odoo
// Necesita DATABASE_URL y las variables ODOO_URL, ODOO_DB, ODOO_USERNAME y ODOO_API_KEY.
import { eq, sql } from 'drizzle-orm'
import { odoo } from '../lib/odoo'
import { closeDb, getDb, schema } from '../lib/db'

const LOTE = 500

type Fila = Record<string, any>

/** Texto de Odoo (false cuando está vacío) a string o null. */
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
/** Many2one de Odoo ([id, nombre] o false) a id o null. */
const m2oId = (v: unknown): number | null => (Array.isArray(v) ? Number(v[0]) : null)
const m2oNombre = (v: unknown): string | null => (Array.isArray(v) ? String(v[1]) : null)

/** Solo pide campos que existan en esta instancia de Odoo (varían según versión y localización). */
async function camposDisponibles(modelo: string, deseados: string[]): Promise<string[]> {
  const info = await odoo.executeKw(modelo, 'fields_get', [], { attributes: ['type'] })
  return deseados.filter((f) => f in info)
}

async function leerTodo(modelo: string, dominio: any[], campos: string[]): Promise<Fila[]> {
  const filas: Fila[] = []
  for (let offset = 0; ; offset += LOTE) {
    const lote: Fila[] = await odoo.executeKw(modelo, 'search_read', [dominio], {
      fields: campos, limit: LOTE, offset, order: 'id',
      context: { active_test: false },
    })
    filas.push(...lote)
    if (lote.length < LOTE) break
  }
  return filas
}

async function importarUsuarios(): Promise<number[]> {
  const db = getDb()
  const filas = await leerTodo('res.users', [['share', '=', false]],
    await camposDisponibles('res.users', ['id', 'name', 'login', 'email', 'active', 'partner_id']))

  let nuevos = 0, vinculados = 0
  for (const u of filas) {
    const email = (txt(u.email) ?? txt(u.login) ?? '').toLowerCase()
    if (!email || !email.includes('@')) continue

    const [porUid] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.odooUid, u.id)).limit(1)
    const [porEmail] = porUid ? [porUid] : await db.select().from(schema.usuarios)
      .where(sql`lower(${schema.usuarios.email}) = ${email}`).limit(1)

    if (porEmail) {
      // Ya existe: solo se vincula a Odoo. No se tocan rol, contraseña ni estado.
      if (porEmail.odooUid !== u.id) {
        await db.update(schema.usuarios).set({ odooUid: u.id, actualizadoEn: new Date() })
          .where(eq(schema.usuarios.id, porEmail.id))
        vinculados++
      }
    } else {
      // Entra sin contraseña: no puede iniciar sesión hasta que Administración le asigne una
      await db.insert(schema.usuarios).values({
        email, nombre: txt(u.name) ?? email, rol: 'vendedor', activo: u.active !== false, odooUid: u.id,
      })
      nuevos++
    }
  }
  console.log(`Usuarios: ${nuevos} nuevos, ${vinculados} vinculados a Odoo (de ${filas.length} internos en Odoo).`)
  // Contactos que son la ficha de un usuario interno: no son clientes
  return filas.map((u) => m2oId(u.partner_id)).filter((id): id is number => id !== null)
}

async function importarContactos(excluir: number[]) {
  const db = getDb()
  const campos = await camposDisponibles('res.partner', [
    'id', 'name', 'vat', 'email', 'phone', 'street', 'street2', 'city', 'state_id',
    'l10n_cl_activity_description', 'is_company', 'customer_rank', 'supplier_rank', 'active', 'comment',
  ])
  // Solo fichas principales: las personas de contacto de una empresa (parent_id) quedan fuera
  const dominio: any[] = [['parent_id', '=', false]]
  if (excluir.length) dominio.push(['id', 'not in', excluir])
  const filas = await leerTodo('res.partner', dominio, campos)

  for (let i = 0; i < filas.length; i += LOTE) {
    const valores = filas.slice(i, i + LOTE).map((p) => {
      const proveedor = (p.supplier_rank ?? 0) > 0
      const cliente = (p.customer_rank ?? 0) > 0 || !proveedor
      const direccion = [txt(p.street), txt(p.street2)].filter(Boolean).join(', ') || null
      return {
        odooId: p.id as number,
        nombre: txt(p.name) ?? `Contacto ${p.id}`,
        rut: txt(p.vat),
        email: txt(p.email),
        telefono: txt(p.phone),
        direccion,
        comuna: txt(p.city),
        region: m2oNombre(p.state_id),
        giro: txt(p.l10n_cl_activity_description),
        esEmpresa: !!p.is_company,
        esCliente: cliente,
        esProveedor: proveedor,
        notas: typeof p.comment === 'string' ? p.comment.replace(/<[^>]+>/g, ' ').trim() || null : null,
        activo: p.active !== false,
        actualizadoEn: new Date(),
      }
    })
    await db.insert(schema.contactos).values(valores).onConflictDoUpdate({
      target: schema.contactos.odooId,
      set: {
        nombre: sql`excluded.nombre`, rut: sql`excluded.rut`, email: sql`excluded.email`,
        telefono: sql`excluded.telefono`, direccion: sql`excluded.direccion`, comuna: sql`excluded.comuna`,
        region: sql`excluded.region`, giro: sql`excluded.giro`, esEmpresa: sql`excluded.es_empresa`,
        esCliente: sql`excluded.es_cliente`, esProveedor: sql`excluded.es_proveedor`,
        notas: sql`excluded.notas`, activo: sql`excluded.activo`, actualizadoEn: sql`excluded.actualizado_en`,
      },
    })
  }
  const prov = filas.filter((p) => (p.supplier_rank ?? 0) > 0).length
  console.log(`Contactos: ${filas.length} importados (${prov} marcados como proveedor).`)
}

async function importarProductos() {
  const db = getDb()

  const categorias = await leerTodo('product.category', [], ['id', 'complete_name', 'name'])
  if (categorias.length) {
    await db.insert(schema.categoriasProducto)
      .values(categorias.map((c) => ({ odooId: c.id as number, nombre: txt(c.complete_name) ?? txt(c.name) ?? `Categoría ${c.id}` })))
      .onConflictDoUpdate({ target: schema.categoriasProducto.odooId, set: { nombre: sql`excluded.nombre` } })
  }
  const mapaCategorias = new Map(
    (await db.select().from(schema.categoriasProducto)).map((c) => [c.odooId, c.id]),
  )

  const campos = await camposDisponibles('product.product', [
    'id', 'name', 'default_code', 'type', 'sale_ok', 'purchase_ok', 'list_price', 'standard_price',
    'uom_id', 'categ_id', 'active',
  ])
  const filas = await leerTodo('product.product', [], campos)

  for (let i = 0; i < filas.length; i += LOTE) {
    const valores = filas.slice(i, i + LOTE).map((p) => ({
      odooId: p.id as number,
      codigo: txt(p.default_code),
      nombre: txt(p.name) ?? `Producto ${p.id}`,
      categoriaId: mapaCategorias.get(m2oId(p.categ_id)) ?? null,
      esServicio: p.type === 'service',
      seVende: p.sale_ok !== false,
      seCompra: !!p.purchase_ok,
      unidad: m2oNombre(p.uom_id) ?? 'Unidad',
      precioVenta: String(Number(p.list_price) || 0),
      costo: String(Number(p.standard_price) || 0),
      activo: p.active !== false,
      actualizadoEn: new Date(),
    }))
    await db.insert(schema.productos).values(valores).onConflictDoUpdate({
      target: schema.productos.odooId,
      set: {
        codigo: sql`excluded.codigo`, nombre: sql`excluded.nombre`, categoriaId: sql`excluded.categoria_id`,
        esServicio: sql`excluded.es_servicio`, seVende: sql`excluded.se_vende`, seCompra: sql`excluded.se_compra`,
        unidad: sql`excluded.unidad`, precioVenta: sql`excluded.precio_venta`, costo: sql`excluded.costo`,
        activo: sql`excluded.activo`, actualizadoEn: sql`excluded.actualizado_en`,
      },
    })
  }
  const insumos = filas.filter((p) => p.purchase_ok && p.sale_ok === false).length
  console.log(`Productos: ${filas.length} importados (${insumos} insumos), ${categorias.length} categorías.`)
}

async function main() {
  console.log(`Conectando a Odoo (${process.env.ODOO_URL || 'sin ODOO_URL'})...`)
  await odoo.authenticate()
  const fichasDeUsuarios = await importarUsuarios()
  await importarContactos(fichasDeUsuarios)
  await importarProductos()
  console.log('Importación terminada.')
}

main()
  .catch((err) => { console.error('La importación falló:', err?.message ?? err); process.exitCode = 1 })
  .finally(() => closeDb())
