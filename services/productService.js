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
         OR p.name_struk LIKE ?
      ORDER BY p.created_at DESC
    `,
    )
    .all(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
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
   GENERATE SKU (AUTO-INCREMENT)
   Format: ITM-001, ITM-002, ...
================================= */
function generateSKU() {
  const row = db
    .prepare(
      `
      SELECT no_sku,
             CAST(SUBSTR(no_sku, 5) AS INTEGER) AS sku_num
      FROM products
      WHERE no_sku LIKE 'ITM-%'
      ORDER BY sku_num DESC
      LIMIT 1
    `,
    )
    .get();

  let nextNumber = 1;

  if (row && row.sku_num) {
    nextNumber = row.sku_num + 1;
  }

  return `ITM-${String(nextNumber).padStart(3, "0")}`;
}

/* ===============================
   CREATE PRODUCT
================================= */
function createProduct(data) {
  const { no_sku, barcode, name, name_struk, category_id, selling_price, unit, min_stock, is_non_barcode } = data;

  const id = crypto.randomUUID();
  const sku = no_sku || generateSKU();

  try {
    db.prepare(
      `
      INSERT INTO products (
        id,
        no_sku,
        barcode,
        name,
        name_struk,
        category_id,
        selling_price,
        unit,
        min_stock,
        is_non_barcode,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `,
    ).run(
      id,
      sku,
      barcode || null,
      name,
      name_struk || name,
      category_id || null,
      selling_price,
      unit,
      min_stock ?? 5,
      is_non_barcode ? 1 : 0,
    );
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE" && barcode) {
      throw new Error(`Barcode "${barcode}" sudah digunakan oleh barang lain.`);
    }
    throw err;
  }

  return { id };
}

/* ===============================
   UPDATE PRODUCT
================================= */
function updateProduct(id, data) {
  const { barcode, name, name_struk, category_id, selling_price, unit, min_stock, is_non_barcode } = data;

  try {
    db.prepare(
      `
      UPDATE products
      SET
        barcode = ?,
        name = ?,
        name_struk = ?,
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
      name_struk || name,
      category_id || null,
      selling_price,
      unit,
      min_stock ?? 5,
      is_non_barcode ? 1 : 0,
      id,
    );
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE" && barcode) {
      throw new Error(`Barcode "${barcode}" sudah digunakan oleh barang lain.`);
    }
    throw err;
  }

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
