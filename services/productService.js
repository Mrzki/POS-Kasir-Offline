const db = require("../database/db");
const crypto = require("crypto");

/* ===============================
   GET ALL PRODUCTS
================================= */
function getAllProducts() {
  return db
    .prepare(
      `
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY p.created_at DESC
    `,
    )
    .all();
}

/* ===============================
   SEARCH PRODUCTS
================================= */
function searchProducts(keyword) {
  return db
    .prepare(
      `
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.name LIKE ?
         OR p.barcode LIKE ?
         OR p.no_sku LIKE ?
      ORDER BY p.created_at DESC
    `,
    )
    .all(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
}

/* ===============================
   GET CATEGORIES
================================= */
function getCategories() {
  return db
    .prepare(
      `
      SELECT id, name
      FROM categories
      ORDER BY name COLLATE NOCASE ASC
    `,
    )
    .all();
}

/* ===============================
   CREATE PRODUCT
================================= */
function createProduct(data) {
  const { no_sku, barcode, name, category_id, selling_price, unit, min_stock, is_non_barcode } = data;

  const id = crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO products (
      id,
      no_sku,
      barcode,
      name,
      category_id,
      selling_price,
      unit,
      min_stock,
      is_non_barcode,
      is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `,
  ).run(
    id,
    no_sku || null,
    barcode || null,
    name,
    category_id || null,
    selling_price,
    unit,
    min_stock ?? 5,
    is_non_barcode ? 1 : 0,
  );

  return { id };
}

/* ===============================
   UPDATE PRODUCT
================================= */
function updateProduct(id, data) {
  const { barcode, name, category_id, selling_price, unit, min_stock, is_non_barcode } = data;

  db.prepare(
    `
    UPDATE products
    SET
      barcode = ?,
      name = ?,
      category_id = ?,
      selling_price = ?,
      unit = ?,
      min_stock = ?,
      is_non_barcode = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
  ).run(
    barcode || null,
    name,
    category_id || null,
    selling_price,
    unit,
    min_stock ?? 5,
    is_non_barcode ? 1 : 0,
    id,
  );

  return true;
}

/* ===============================
   TOGGLE ACTIVE
================================= */
function toggleProductActive(id) {
  const current = db
    .prepare(
      `
      SELECT id, is_active
      FROM products
      WHERE id = ?
    `,
    )
    .get(id);

  if (!current) {
    throw new Error("Produk tidak ditemukan");
  }

  const nextStatus = current.is_active ? 0 : 1;

  db.prepare(
    `
    UPDATE products
    SET
      is_active = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
  ).run(nextStatus, id);

  return {
    id,
    is_active: nextStatus,
  };
}

module.exports = {
  getAllProducts,
  searchProducts,
  getCategories,
  createProduct,
  updateProduct,
  toggleProductActive,
};
