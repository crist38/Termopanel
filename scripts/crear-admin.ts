// Crea (o restablece) un usuario con rol Administración.
// Uso: npm run crear-admin -- correo@empresa.cl "Nombre Apellido" contraseña
import { sql } from 'drizzle-orm'
import { closeDb, getDb, schema } from '../lib/db'
import { hashPassword, MIN_PASSWORD_LENGTH } from '../lib/auth/password'

async function main() {
  const [emailArg, nombre, password] = process.argv.slice(2)
  const email = emailArg?.trim().toLowerCase()
  if (!email || !nombre || !password) {
    console.error('Uso: npm run crear-admin -- correo@empresa.cl "Nombre Apellido" contraseña')
    process.exit(1)
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
    process.exit(1)
  }

  const db = getDb()
  const passwordHash = await hashPassword(password)
  const [existe] = await db.select().from(schema.usuarios)
    .where(sql`lower(${schema.usuarios.email}) = ${email}`).limit(1)

  if (existe) {
    await db.update(schema.usuarios)
      .set({ nombre, rol: 'administracion', activo: true, passwordHash, actualizadoEn: new Date() })
      .where(sql`${schema.usuarios.id} = ${existe.id}`)
    console.log(`Usuario ${email} actualizado como Administración.`)
  } else {
    await db.insert(schema.usuarios).values({ email, nombre, rol: 'administracion', passwordHash })
    console.log(`Usuario ${email} creado con rol Administración.`)
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => closeDb())
