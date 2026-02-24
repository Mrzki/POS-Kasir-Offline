const db = require("../database/db");
const crypto = require("crypto");

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toISODateOrDefault(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  return getTodayDate();
}

// Normalisasi angka positif untuk qty/cost.
function toPositiveNumber(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} harus lebih besar dari 0`);
  }

  return parsed;
}

// Cost price disimpan INTEGER agar konsisten dengan schema.
function toPositiveInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} harus berupa bilangan bulat positif`);
  }

  return parsed;
}

function ensureProduct(productId) {
  if (!productId) {
    throw new Error("Produk wajib dipilih");
  }

  const product = db
    .prepare(
      `
      SELECT
        p.id,
        p.name,
        p.barcode,
        p.unit,
        p.is_active,
        c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = ?
    `,
    )
    .get(productId);

  if (!product) {
    throw new Error("Produk tidak ditemukan");
  }

  return product;
}

function getTotalStock(productId) {
  const row = db
    .prepare(
      `
      SELECT COALESCE(SUM(quantity_remaining), 0) AS total_stock
      FROM stock_batches
      WHERE product_id = ?
    `,
    )
    .get(productId);

  return Number(row?.total_stock || 0);
}

// List produk beserta stok total untuk tabel ringkasan.
function getAllStock() {
  return db
    .prepare(
      `
      SELECT
        p.id AS product_id,
        p.name,
        p.barcode,
        c.name AS category_name,
        p.unit,
        p.is_active,
        COALESCE(SUM(sb.quantity_remaining), 0) AS total_stock,
        COUNT(sb.id) AS batch_count
      FROM products p
      LEFT JOIN categories c
        ON c.id = p.category_id
      LEFT JOIN stock_batches sb
        ON sb.product_id = p.id
       AND sb.quantity_remaining > 0
      GROUP BY p.id, p.name, p.barcode, c.name, p.unit, p.is_active
      ORDER BY p.name COLLATE NOCASE ASC
    `,
    )
    .all();
}

// Detail stok per produk: total + seluruh batch tersisa (FIFO order).
function getStock(productId) {
  const product = ensureProduct(productId);

  const batches = db
    .prepare(
      `
      SELECT
        id,
        quantity_initial,
        quantity_remaining,
        cost_price,
        stock_date,
        created_at
      FROM stock_batches
      WHERE product_id = ?
        AND quantity_remaining > 0
      ORDER BY stock_date ASC, created_at ASC, id ASC
    `,
    )
    .all(product.id);

  return {
    productId: product.id,
    productName: product.name,
    categoryName: product.category_name || "-",
    barcode: product.barcode,
    unit: product.unit,
    totalStock: getTotalStock(product.id),
    batches,
  };
}

// Stok masuk selalu membuat batch baru.
function addStock(data) {
  const productId = data?.productId ?? data?.product_id;
  const quantity = toPositiveNumber(data?.qty ?? data?.quantity, "Jumlah stok");
  const costPrice = toPositiveInteger(
    data?.costPrice ?? data?.cost_price,
    "Harga modal",
  );
  const stockDate = toISODateOrDefault(data?.stockDate ?? data?.stock_date);
  const product = ensureProduct(productId);

  if (!product.is_active) {
    throw new Error("Produk nonaktif tidak bisa ditambahkan stok");
  }

  const id = crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO stock_batches (
      id,
      product_id,
      quantity_initial,
      quantity_remaining,
      cost_price,
      stock_date
    ) VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(id, product.id, quantity, quantity, costPrice, stockDate);

  return {
    id,
    productId: product.id,
    totalStock: getTotalStock(product.id),
  };
}

// Stok keluar diproses FIFO dalam satu transaksi atomik.
function removeStock(productId, qty) {
  const product = ensureProduct(productId);
  const quantity = toPositiveNumber(qty, "Jumlah stok keluar");

  const consumeStock = db.transaction(() => {
    const available = getTotalStock(product.id);
    if (available < quantity) {
      throw new Error(`Stok tidak cukup. Stok tersedia: ${available}`);
    }

    let remainingToRemove = quantity;
    const usages = [];

    const batches = db
      .prepare(
        `
        SELECT id, quantity_remaining
        FROM stock_batches
        WHERE product_id = ?
          AND quantity_remaining > 0
        ORDER BY stock_date ASC, created_at ASC, id ASC
      `,
      )
      .all(product.id);

    for (const batch of batches) {
      if (remainingToRemove <= 0) break;

      const taken = Math.min(remainingToRemove, Number(batch.quantity_remaining));

      db.prepare(
        `
        UPDATE stock_batches
        SET quantity_remaining = quantity_remaining - ?
        WHERE id = ?
      `,
      ).run(taken, batch.id);

      usages.push({
        batchId: batch.id,
        removedQty: taken,
      });

      remainingToRemove -= taken;
    }

    if (remainingToRemove > 0) {
      throw new Error("Pengurangan stok gagal diproses");
    }

    return usages;
  });

  const usages = consumeStock();

  return {
    productId: product.id,
    removedQty: quantity,
    totalStock: getTotalStock(product.id),
    usages,
  };
}

// Update batch stok yang sudah ada (koreksi jumlah, harga, tanggal).
function updateStockBatch(batchId, data) {
  if (!batchId) {
    throw new Error("Batch ID wajib diisi");
  }

  const batch = db
    .prepare("SELECT * FROM stock_batches WHERE id = ?")
    .get(batchId);

  if (!batch) {
    throw new Error("Batch stok tidak ditemukan");
  }

  const quantityInitial = toPositiveNumber(
    data?.quantityInitial ?? data?.quantity_initial,
    "Jumlah stok awal",
  );
  const costPrice = toPositiveInteger(
    data?.costPrice ?? data?.cost_price,
    "Harga modal",
  );
  const stockDate = toISODateOrDefault(data?.stockDate ?? data?.stock_date);

  // Hitung qty yang sudah terpakai (terjual / dikurangi)
  const usedQty = Number(batch.quantity_initial) - Number(batch.quantity_remaining);

  if (quantityInitial < usedQty) {
    throw new Error(
      `Jumlah stok awal tidak boleh kurang dari ${usedQty} (sudah terpakai)`,
    );
  }

  // Sesuaikan quantity_remaining agar selisih terpakai tetap konsisten
  const newRemaining = quantityInitial - usedQty;

  db.prepare(
    `
    UPDATE stock_batches
    SET quantity_initial = ?,
        quantity_remaining = ?,
        cost_price = ?,
        stock_date = ?
    WHERE id = ?
  `,
  ).run(quantityInitial, newRemaining, costPrice, stockDate, batchId);

  return {
    batchId,
    productId: batch.product_id,
    totalStock: getTotalStock(batch.product_id),
  };
}

// Hapus batch stok. Hanya bisa dihapus jika belum ada qty terpakai.
function deleteStockBatch(batchId) {
  if (!batchId) {
    throw new Error("Batch ID wajib diisi");
  }

  const batch = db
    .prepare("SELECT * FROM stock_batches WHERE id = ?")
    .get(batchId);

  if (!batch) {
    throw new Error("Batch stok tidak ditemukan");
  }

  const usedQty = Number(batch.quantity_initial) - Number(batch.quantity_remaining);

  if (usedQty > 0) {
    throw new Error(
      `Batch tidak bisa dihapus karena ${usedQty} unit sudah terpakai. Gunakan fitur edit untuk mengubah jumlah.`,
    );
  }

  db.prepare("DELETE FROM stock_batches WHERE id = ?").run(batchId);

  return {
    batchId,
    productId: batch.product_id,
    totalStock: getTotalStock(batch.product_id),
  };
}

module.exports = {
  getStock,
  getAllStock,
  addStock,
  removeStock,
  updateStockBatch,
  deleteStockBatch,
};
