// Esquema de la base de datos propia (PostgreSQL), que reemplaza de a poco a Odoo.
// Los campos odoo_id guardan el id del registro original para poder importar
// varias veces sin duplicar y para cruzar datos mientras Odoo siga en uso.

import {
  pgTable, pgEnum, serial, integer, text, boolean, numeric, timestamp, uniqueIndex, index,
} from 'drizzle-orm/pg-core'

export const rolEnum = pgEnum('rol', ['vendedor', 'taller', 'bodega', 'administracion', 'tecnico'])

export const usuarios = pgTable('usuarios', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  nombre: text('nombre').notNull(),
  rol: rolEnum('rol').notNull().default('vendedor'),
  // Hash scrypt; null mientras el administrador no le asigne contraseña
  passwordHash: text('password_hash'),
  activo: boolean('activo').notNull().default(true),
  odooUid: integer('odoo_uid'),
  ultimoAcceso: timestamp('ultimo_acceso', { withTimezone: true }),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('usuarios_email_idx').on(t.email),
  uniqueIndex('usuarios_odoo_uid_idx').on(t.odooUid),
])

// Clientes y proveedores en una sola tabla, como res.partner en Odoo,
// para no duplicar a quien es ambas cosas.
export const contactos = pgTable('contactos', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  rut: text('rut'),
  email: text('email'),
  telefono: text('telefono'),
  direccion: text('direccion'),
  comuna: text('comuna'),
  region: text('region'),
  giro: text('giro'),
  esEmpresa: boolean('es_empresa').notNull().default(false),
  esCliente: boolean('es_cliente').notNull().default(true),
  esProveedor: boolean('es_proveedor').notNull().default(false),
  notas: text('notas'),
  activo: boolean('activo').notNull().default(true),
  odooId: integer('odoo_id'),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('contactos_odoo_id_idx').on(t.odooId),
  index('contactos_rut_idx').on(t.rut),
  index('contactos_nombre_idx').on(t.nombre),
])

export const categoriasProducto = pgTable('categorias_producto', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  odooId: integer('odoo_id'),
}, (t) => [
  uniqueIndex('categorias_producto_odoo_id_idx').on(t.odooId),
])

// Productos de venta, insumos de fabricación y servicios.
// Un insumo es un producto que se compra y no se vende (se_compra y no se_vende).
export const productos = pgTable('productos', {
  id: serial('id').primaryKey(),
  codigo: text('codigo'),
  nombre: text('nombre').notNull(),
  categoriaId: integer('categoria_id').references(() => categoriasProducto.id, { onDelete: 'set null' }),
  esServicio: boolean('es_servicio').notNull().default(false),
  seVende: boolean('se_vende').notNull().default(true),
  seCompra: boolean('se_compra').notNull().default(false),
  unidad: text('unidad').notNull().default('Unidad'),
  precioVenta: numeric('precio_venta', { precision: 14, scale: 2 }).notNull().default('0'),
  costo: numeric('costo', { precision: 14, scale: 2 }).notNull().default('0'),
  activo: boolean('activo').notNull().default(true),
  odooId: integer('odoo_id'),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('productos_odoo_id_idx').on(t.odooId),
  index('productos_codigo_idx').on(t.codigo),
])

export type Usuario = typeof usuarios.$inferSelect
export type Contacto = typeof contactos.$inferSelect
export type Producto = typeof productos.$inferSelect
