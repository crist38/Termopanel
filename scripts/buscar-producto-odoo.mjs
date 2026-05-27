// Script para buscar productos disponibles en Odoo
// Ejecutar con: node scripts/buscar-producto-odoo.mjs

const ODOO_URL = "https://prowindows-ltda.odoo.com";
const ODOO_DB = "prowindows-ltda";
const ODOO_USERNAME = "cristian3877@gmail.com";
const ODOO_API_KEY = "Up2QaI7FhSmbIq1";

async function rpc(service, method, args) {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call', id: 1,
      params: { service, method, args }
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result;
}

async function main() {
  // 1. Autenticar
  const uid = await rpc('common', 'authenticate', [ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {}]);
  console.log('✅ Autenticado. UID:', uid);

  // 2. Buscar productos de tipo servicio o con "termopanel" en el nombre
  const productos = await rpc('object', 'execute_kw', [
    ODOO_DB, uid, ODOO_API_KEY,
    'product.product', 'search_read',
    [[['sale_ok', '=', true]]],
    { fields: ['id', 'name', 'type', 'list_price'], limit: 20, order: 'id asc' }
  ]);

  console.log('\n📦 Primeros 20 productos disponibles para venta en Odoo:\n');
  productos.forEach(p => {
    console.log(`  ID: ${p.id} | Nombre: "${p.name}" | Tipo: ${p.type} | Precio: ${p.list_price}`);
  });

  console.log('\n💡 Copia el ID del producto que quieras usar como genérico y pégalo en .env.local como:');
  console.log('   ODOO_DEFAULT_PRODUCT_ID=<el_id_que_elegiste>');
}

main().catch(console.error);
