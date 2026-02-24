const { app, BrowserWindow } = require("electron");
const path = require("path");
const transactionService = require("./services/transactionService");
const productService = require("./services/productService");
const dashboardService = require("./services/dashboardService");
const stockService = require("./services/stockService");

// INIT DATABASE
require("./database/db");

const { ipcMain } = require("electron");
const db = require("./database/db");
const transactionsTableColumns = db.prepare("PRAGMA table_info(transactions)").all();
const hasIsVoidedColumn = transactionsTableColumns.some(
  (column) => column.name === "is_voided",
);

function toISODate(value) {
  if (typeof value !== "string") return null;

  const trimmedValue = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) return null;

  return trimmedValue;
}

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveDateRange(range = {}) {
  const parsedStartDate = toISODate(range.startDate ?? range.fromDate);
  const parsedEndDate = toISODate(range.endDate ?? range.toDate);
  const fallbackDate = getTodayDate();

  const startDate = parsedStartDate || fallbackDate;
  const endDate = parsedEndDate || fallbackDate;

  if (startDate > endDate) {
    throw new Error("Rentang tanggal tidak valid.");
  }

  return { startDate, endDate };
}

function getNonVoidedSaleCondition(alias = "t") {
  const clauses = [
    `NOT EXISTS (
      SELECT 1
      FROM transactions v
      WHERE v.type = 'void'
        AND v.reference_transaction_id = ${alias}.id
    )`,
  ];

  if (hasIsVoidedColumn) {
    clauses.push(`COALESCE(${alias}.is_voided, 0) = 0`);
  }

  return clauses.map((clause) => `AND ${clause}`).join("\n        ");
}

const nonVoidedSaleCondition = getNonVoidedSaleCondition("t");

ipcMain.handle("navigate", (event, target) => {
  switch (target) {
    case "dashboard":
      openDashboardWindow();
      break;

    case "kasir":
      createWindow();
      break;

    case "products":
      openProductsWindow();
      break;

    case "stocks":
      openStockWindow();
      break;

    case "transactions":
      openTransactionReportWindow();
      break;

    case "sales":
      openSalesReportWindow();
      break;
  }
});

ipcMain.handle("find-product-by-barcode", (event, barcode) => {
  try {
    const product = db
      .prepare(
        `
      SELECT *
      FROM products
      WHERE barcode = ?
        AND is_active = 1
    `,
      )
      .get(barcode);

    return product;
  } catch (error) {
    throw error;
  }
});

ipcMain.handle("get-ecer-products", () => {
  try {
    return db
      .prepare(
        `
      SELECT *
      FROM products
      WHERE is_non_barcode = 1
        AND is_active = 1
      ORDER BY name COLLATE NOCASE ASC
    `,
      )
      .all();
  } catch (error) {
    throw error;
  }
});

ipcMain.handle("print-receipt", async (event, transactionId) => {
  printReceipt(transactionId);
});

ipcMain.handle("get-report-by-date", (event, date) => {
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT 
        COUNT(id) AS total_transactions,
        SUM(total) AS total_income
      FROM transactions
      WHERE substr(datetime(created_at, '+7 hours'), 1, 10) = ?
      `,
      [date],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      },
    );
  });
});

ipcMain.handle("check-stock", (event, productId) => {
  return transactionService.checkStock(productId);
});

ipcMain.handle("process-sale", async (event, data) => {
  return transactionService.processSale(data.cartItems, data.paymentAmount);
});

ipcMain.handle("void-transaction", (event, transactionId) => {
  return transactionService.voidTransaction(transactionId);
});

ipcMain.handle("get-transaction-detail", (event, transactionId) => {
  return transactionService.getTransactionDetail(transactionId);
});

ipcMain.handle("dashboard:get-daily-summary", (event, date) => {
  return dashboardService.getDailySummary(date);
});

ipcMain.handle("dashboard:get-hourly-analytics", (event, date) => {
  return dashboardService.getHourlyAnalytics(date);
});

ipcMain.handle("dashboard:get-top-products", (event, { date, limit }) => {
  return dashboardService.getTopProducts(date, limit ?? 5);
});

ipcMain.handle("open-dashboard", () => {
  openDashboardWindow();
  return true;
});

/* ===============================
   PRODUCTS IPC
================================= */

ipcMain.handle("products:get-all", () => {
  return productService.getAllProducts();
});

ipcMain.handle("products:search", (event, keyword) => {
  return productService.searchProducts(keyword);
});

ipcMain.handle("products:get-categories", () => {
  return productService.getCategories();
});

ipcMain.handle("products:create", (event, data) => {
  return productService.createProduct(data);
});

ipcMain.handle("products:update", (event, { id, data }) => {
  return productService.updateProduct(id, data);
});

ipcMain.handle("products:toggle-active", (event, id) => {
  return productService.toggleProductActive(id);
});

// Stoсk IPC
ipcMain.handle("stock:get-all", () => {
  return stockService.getAllStock();
});

ipcMain.handle("stock:get", (event, productId) => {
  return stockService.getStock(productId);
});

ipcMain.handle("stock:add", (event, data) => {
  return stockService.addStock(data);
});

ipcMain.handle("stock:remove", (event, data) => {
  return stockService.removeStock(data.productId, data.qty);
});

ipcMain.handle("stock:update-batch", (event, { batchId, data }) => {
  return stockService.updateStockBatch(batchId, data);
});

ipcMain.handle("stock:delete-batch", (event, batchId) => {
  return stockService.deleteStockBatch(batchId);
});

ipcMain.handle("open-report", () => {
  openReportWindow();
  return true;
});

// Transaction IPC
    ipcMain.handle("get-transactions", (event, range = {}) => {
      const { startDate, endDate } = resolveDateRange(range);
    
      return db
        .prepare(
          `
          SELECT
            t.id,
            t.transaction_number,
            t.total_amount,
            t.created_at,
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM transactions v
                WHERE v.type = 'void'
                  AND v.reference_transaction_id = t.id
              ) THEN 1
              ELSE 0
            END AS is_voided
          FROM transactions t
          WHERE t.type = 'sale'
            AND substr(datetime(t.created_at, '+7 hours'), 1, 10) BETWEEN ? AND ?
          ORDER BY t.created_at DESC
        `,
        )
        .all(startDate, endDate);
    });


// Sales report IPC
ipcMain.handle("sales:get-summary", (event, range = {}) => {
  const { startDate, endDate } = resolveDateRange(range);

  return db
    .prepare(
      `
      SELECT
        ti.product_id,
        COALESCE(NULLIF(TRIM(p.barcode), ''), '-') AS product_code,
        COALESCE(p.name, '(Produk tidak ditemukan)') AS product_name,
        COALESCE(c.name, '-') AS category_name,
        COALESCE(SUM(ti.quantity), 0) AS total_qty,
        COALESCE(SUM(ti.subtotal), 0) AS total_revenue,
        COALESCE(SUM(ti.profit), 0) AS total_profit
      FROM transaction_items ti
      JOIN transactions t
        ON t.id = ti.transaction_id
      LEFT JOIN products p
        ON p.id = ti.product_id
      LEFT JOIN categories c
        ON c.id = p.category_id
      WHERE t.type = 'sale'
        AND ti.quantity > 0
        AND DATE(datetime(t.created_at, '+7 hours')) BETWEEN DATE(?) AND DATE(?)
        ${nonVoidedSaleCondition}
      GROUP BY
        ti.product_id,
        p.barcode,
        p.id,
        p.name,
        c.name
      ORDER BY
        p.name COLLATE NOCASE ASC,
        ti.product_id ASC
    `,
    )
    .all(startDate, endDate);
});

ipcMain.handle("sales:get-product-detail", (event, payload = {}) => {
  const productId =
    typeof payload.productId === "string" ? payload.productId.trim() : "";

  if (!productId) {
    throw new Error("Produk wajib dipilih.");
  }

  const { startDate, endDate } = resolveDateRange(payload);

  const product =
    db
      .prepare(
        `
      SELECT
        p.id AS product_id,
        COALESCE(NULLIF(TRIM(p.barcode), ''), '-') AS product_code,
        COALESCE(p.name, '(Produk tidak ditemukan)') AS product_name,
        COALESCE(c.name, '-') AS category_name
      FROM products p
      LEFT JOIN categories c
        ON c.id = p.category_id
      WHERE p.id = ?
    `,
      )
      .get(productId) ||
    db
      .prepare(
        `
      SELECT
        ti.product_id,
        COALESCE(NULLIF(TRIM(p.barcode), ''), '-') AS product_code,
        COALESCE(p.name, '(Produk tidak ditemukan)') AS product_name,
        COALESCE(c.name, '-') AS category_name
      FROM transaction_items ti
      LEFT JOIN products p
        ON p.id = ti.product_id
      LEFT JOIN categories c
        ON c.id = p.category_id
      WHERE ti.product_id = ?
      LIMIT 1
    `,
      )
      .get(productId) || {
      product_id: productId,
      product_code: "-",
      product_name: "(Produk tidak ditemukan)",
      category_name: "-",
    };

  const items = db
    .prepare(
      `
      SELECT
        t.id AS transaction_id,
        t.transaction_number,
        t.created_at,
        ti.quantity,
        ti.subtotal,
        ti.profit
      FROM transaction_items ti
      JOIN transactions t
        ON t.id = ti.transaction_id
      WHERE ti.product_id = ?
        AND t.type = 'sale'
        AND ti.quantity > 0
        AND DATE(datetime(t.created_at, '+7 hours')) BETWEEN DATE(?) AND DATE(?)
        ${nonVoidedSaleCondition}
      ORDER BY
        t.created_at DESC,
        t.id DESC
    `,
    )
    .all(productId, startDate, endDate);

  return {
    product,
    items,
    range: { startDate, endDate },
  };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadFile("src/index.html");
}

function printReceipt(transactionId) {
  const win = new BrowserWindow({
    width: 300,
    height: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadFile("src/receipt.html");

  // Step 1: Setelah HTML loaded, kirim data transaksi ke renderer
  win.webContents.once("did-finish-load", () => {
    win.webContents.send("load-transaction", transactionId);
  });

  // Step 2: Tunggu signal receipt-ready (data sudah di-render)
  const onReceiptReady = () => {
    if (win.isDestroyed()) return;

    win.webContents.print(
      {
        silent: false,        // Tampilkan dialog print
        printBackground: true, // Cetak background/warna
      },
      (success, failureReason) => {
        if (!success && failureReason) {
          console.error("Print gagal:", failureReason);
        }
        if (!win.isDestroyed()) win.close();
      },
    );
  };

  ipcMain.once("receipt-ready", onReceiptReady);

  // Timeout safety: tutup window jika terlalu lama (30 detik)
  const timeout = setTimeout(() => {
    ipcMain.removeListener("receipt-ready", onReceiptReady);
    if (!win.isDestroyed()) win.close();
  }, 30000);

  win.once("closed", () => {
    clearTimeout(timeout);
    ipcMain.removeListener("receipt-ready", onReceiptReady);
  });
}

function openDashboardWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadFile("src/dashboard.html");
}

app.whenReady().then(() => {
  createWindow();
});
