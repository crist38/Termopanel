import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

type DB = PostgresJsDatabase<typeof schema>

// En desarrollo Next recarga los módulos; se guarda la conexión en globalThis
// para no abrir una nueva en cada recarga.
const globalForDb = globalThis as unknown as { __erpDb?: DB; __erpSql?: postgres.Sql }

/**
 * Retorna la conexión a PostgreSQL. Falla con un mensaje claro si falta DATABASE_URL.
 */
export function getDb(): DB {
  if (globalForDb.__erpDb) return globalForDb.__erpDb
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Falta la variable DATABASE_URL para conectar con la base de datos.')
  const client = postgres(url, { max: 10 })
  const db = drizzle(client, { schema })
  globalForDb.__erpDb = db
  globalForDb.__erpSql = client
  return db
}

/** Cierra la conexión. Solo para scripts de línea de comandos. */
export async function closeDb(): Promise<void> {
  await globalForDb.__erpSql?.end()
  globalForDb.__erpDb = undefined
  globalForDb.__erpSql = undefined
}

export { schema }
