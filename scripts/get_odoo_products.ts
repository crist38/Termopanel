import { odoo } from '../lib/odoo';

async function fetchProducts() {
  try {
    const products = await odoo.executeKw('product.product', 'search_read', [
      [
        '|', '|', '|', '|', '|', '|', '|',
        ['name', 'ilike', 'plancha'],
        ['name', 'ilike', 'hotmelt'],
        ['name', 'ilike', 'butilo'],
        ['name', 'ilike', 'sal'],
        ['name', 'ilike', 'escuadra'],
        ['name', 'ilike', 'separador'],
        ['name', 'ilike', 'cristal'],
        ['name', 'ilike', 'vidrio']
      ],
      ['id', 'name', 'default_code', 'type', 'purchase_ok']
    ]);
    
    console.log("=== ODOO PRODUCTS ===");
    for (const p of products) {
      if (p.purchase_ok || p.type === 'consu' || p.type === 'product') {
        console.log(`ID: ${p.id} | Name: "${p.name}" | Ref: ${p.default_code || ''}`);
      }
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

fetchProducts();
