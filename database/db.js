const path = require("path");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "kasir.db");

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

module.exports = db;
