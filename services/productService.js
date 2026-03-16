const db = require("../database/db");
const crypto = require("crypto");

/* ===============================
   HELPER: Attach packages ke array products
================================= */
function attachPackagesToProducts(products) {
  if (!products.length) return products;

  const productIds = products.map((p) => p.id);
  const placeholders = productIds.map(() => "?").join(",");

  const allPackages = db
    .prepare(
      `
      SELECT id, product_id, package_name, conversion_qty, price
      FROM product_packages
      WHERE product_id IN (${placeholders})
      ORDER BY conversion_qty DESC
    `,
    )
    .all(...productIds);

  // Group packages by product_id
  const packageMap = new Map();
  for (const pkg of allPackages) {
    if (!packageMap.has(pkg.product_id)) {
      packageMap.set(pkg.product_id, []);
    }
    packageMap.get(pkg.product_id).push(pkg);
  }

  // Attach ke setiap product
  for (const product of products) {
    product.packages = packageMap.get(product.id) || [];
  }

  return products;
}

/* ===============================
   GET ALL PRODUCTS
================================= */
function getAllProducts() {
  const products = db
    .prepare(
      `
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY p.created_at DESC
    `,
    )
    .all();

  return attachPackagesToProducts(products);
}

/* ===============================
   SEARCH PRODUCTS
================================= */
function searchProducts(keyword) {
  const products = db
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

  return attachPackagesToProducts(products);
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
   GET PACKAGES BY PRODUCT ID
================================= */
function getPackagesByProductId(productId) {
  return db
    .prepare(
      `
      SELECT id, product_id, package_name, conversion_qty, price
      FROM product_packages
      WHERE product_id = ?
      ORDER BY conversion_qty DESC
    `,
    )
    .all(productId);
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
   SAVE PACKAGES (helper internal)
   Menghapus semua packages lama, lalu insert baru.
================================= */
function savePackages(productId, packages) {
  // Hapus packages lama
  db.prepare(`DELETE FROM product_packages WHERE product_id = ?`).run(productId);

  if (!Array.isArray(packages) || !packages.length) return;

  const insertStmt = db.prepare(
    `
    INSERT INTO product_packages (id, product_id, package_name, conversion_qty, price)
    VALUES (?, ?, ?, ?, ?)
  `,
  );

  for (const pkg of packages) {
    const pkgName = (pkg.package_name || "").trim();
    const convQty = parseInt(pkg.conversion_qty, 10);
    const price = parseInt(pkg.price, 10);

    // Skip baris yang tidak valid
    if (!pkgName || !convQty || convQty <= 0 || !price || price <= 0) continue;

    insertStmt.run(crypto.randomUUID(), productId, pkgName, convQty, price);
  }
}

/* ===============================
   CREATE PRODUCT
================================= */
function createProduct(data) {
  const { no_sku, barcode, name, name_struk, category_id, selling_price, unit, min_stock, is_non_barcode, packages } = data;

  const id = crypto.randomUUID();
  const sku = no_sku || generateSKU();

  const createTransaction = db.transaction(() => {
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

    // Simpan data kemasan (packages)
    savePackages(id, packages);
  });

  createTransaction();

  return { id };
}

/* ===============================
   UPDATE PRODUCT
================================= */
function updateProduct(id, data) {
  const { barcode, name, name_struk, category_id, selling_price, unit, min_stock, is_non_barcode, packages } = data;

  const updateTransaction = db.transaction(() => {
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

    // Update data kemasan (hapus lama, insert baru)
    savePackages(id, packages);
  });

  updateTransaction();

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
  getPackagesByProductId,
  createProduct,
  updateProduct,
  toggleProductActive,
};
