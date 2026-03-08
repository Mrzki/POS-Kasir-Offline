const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

/**
 * Menentukan path database berdasarkan environment:
 * - Development: menggunakan file di folder project (database/kasir.db)
 * - Production (packaged): menyalin database ke userData agar writable
 */
function resolveDbPath() {
  const { app } = require("electron");
  const isPackaged = app?.isPackaged ?? false;

  if (!isPackaged) {
    // Development — gunakan database langsung dari folder project
    return path.join(__dirname, "kasir.db");
  }

  // Production — database harus di folder userData agar writable
  const userDataPath = app.getPath("userData");
  const targetDbPath = path.join(userDataPath, "kasir.db");

  if (!fs.existsSync(targetDbPath)) {
    // First run: salin database template dari resources
    const sourceDbPath = path.join(process.resourcesPath, "database", "kasir.db");

    if (fs.existsSync(sourceDbPath)) {
      fs.copyFileSync(sourceDbPath, targetDbPath);
      console.log("Database copied to userData:", targetDbPath);
    } else {
      // Fallback: coba dari __dirname (jika tidak pakai extraResources)
      const fallbackPath = path.join(__dirname, "kasir.db");
      if (fs.existsSync(fallbackPath)) {
        fs.copyFileSync(fallbackPath, targetDbPath);
        console.log("Database copied from fallback:", targetDbPath);
      }
    }
  }

  return targetDbPath;
}

const dbPath = resolveDbPath();

console.log("Using database:", dbPath);

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

// Migration: add name column to transaction_items for manual items
try {
  db.prepare("ALTER TABLE transaction_items ADD COLUMN name TEXT").run();
} catch (_err) {
  // Column already exists — ignore
}

// Migration: make batch_id nullable for non-barcode / manual items
try {
  const tableInfo = db.prepare("PRAGMA table_info(transaction_items)").all();
  const batchCol = tableInfo.find((col) => col.name === "batch_id");

  if (batchCol && batchCol.notnull === 1) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE transaction_items_new (
          id TEXT PRIMARY KEY,
          transaction_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          batch_id TEXT,
          quantity REAL NOT NULL DEFAULT 0,
          selling_price REAL NOT NULL DEFAULT 0,
          cost_price REAL NOT NULL DEFAULT 0,
          subtotal REAL NOT NULL DEFAULT 0,
          profit REAL NOT NULL DEFAULT 0,
          name TEXT,
          FOREIGN KEY (transaction_id) REFERENCES transactions(id)
        );

        INSERT INTO transaction_items_new
          SELECT id, transaction_id, product_id, batch_id,
                 quantity, selling_price, cost_price, subtotal, profit, name
          FROM transaction_items;

        DROP TABLE transaction_items;

        ALTER TABLE transaction_items_new RENAME TO transaction_items;
      `);
    })();
    console.log("Migration: batch_id is now nullable in transaction_items");
  }
} catch (migrationErr) {
  console.error("Migration batch_id nullable failed:", migrationErr.message);
}

// Migration: add no_sku column to products for SKU number
try {
  db.prepare("ALTER TABLE products ADD COLUMN no_sku TEXT UNIQUE").run();
  console.log("Migration: no_sku column added to products");
} catch (_err) {
  // Column already exists — ignore
}

// Migration: add min_stock column to products
try {
  db.prepare("ALTER TABLE products ADD COLUMN min_stock INTEGER DEFAULT 5").run();
  console.log("Migration: min_stock column added to products");
} catch (_err) {
  // Column already exists — ignore
}

// Migration: add name_struk column to products
try {
  db.prepare("ALTER TABLE products ADD COLUMN name_struk TEXT").run();
  // Backfill: set name_struk = name for existing products
  db.prepare("UPDATE products SET name_struk = name WHERE name_struk IS NULL").run();
  console.log("Migration: name_struk column added to products");
} catch (_err) {
  // Column already exists — ignore
}

module.exports = db;
