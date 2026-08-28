// Script para buscar productos disponibles en Odoo
// Ejecutar con: node scripts/buscar-producto-odoo.mjs

import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
});

const ODOO_URL = envVars.ODOO_URL;
const ODOO_DB = envVars.ODOO_DB;
const ODOO_USERNAME = envVars.ODOO_USERNAME;
const ODOO_API_KEY = envVars.ODOO_PASSWORD || envVars.ODOO_API_KEY;

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

  const monoliticos = await rpc('object', 'execute_kw', [
    ODOO_DB, uid, ODOO_API_KEY,
    'product.product', 'search_read',
    [[['name', 'ilike', 'monol']]],
    { fields: ['id', 'name', 'default_code'] }
  ]);
  console.log('\n📦 Productos Monolíticos:', monoliticos);
}

main().catch(console.error);
