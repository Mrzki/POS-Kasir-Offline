const db = require("../database/db");
const crypto = require("crypto");
const ExcelJS = require("exceljs");

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
   GENERATE TEMPLATE EXCEL
================================= */
async function generateTemplate() {
  // 1. Query semua kategori
  const categories = db
    .prepare(
      `
      SELECT name
      FROM categories
      ORDER BY name COLLATE NOCASE ASC
    `,
    )
    .all();

  const categoryNames = categories.map((c) => c.name);

  // 2. Buat workbook & worksheet
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "POS Kasir";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Template Import Barang");

  // 3. Baris 1 — Keterangan
  sheet.mergeCells("A1:H1");
  const infoCell = sheet.getCell("A1");
  infoCell.value =
    '📌 Kosongkan kolom "No SKU" jika ini barang baru (akan di-generate otomatis). Isi No SKU jika ingin update data barang yang sudah ada. Kolom "Barcode" dan "Min Stok" bersifat opsional. Isi kolom "Tanpa Barcode" dengan Ya/Tidak.';
  infoCell.font = {
    italic: true,
    color: { argb: "FF2563EB" },
    size: 11,
  };
  infoCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFDBEAFE" },
  };
  infoCell.alignment = {
    vertical: "middle",
    wrapText: true,
  };
  sheet.getRow(1).height = 40;

  // 4. Baris 2 — Header
  const headers = [
    { header: "No SKU", key: "no_sku", width: 18 },
    { header: "Nama Barang", key: "name", width: 30 },
    { header: "Kategori", key: "category", width: 20 },
    { header: "Harga Jual", key: "selling_price", width: 15 },
    { header: "Satuan", key: "unit", width: 12 },
    { header: "Barcode", key: "barcode", width: 22 },
    { header: "Min Stok", key: "min_stock", width: 12 },
    { header: "Tanpa Barcode", key: "is_non_barcode", width: 16 },
  ];

  const headerRow = sheet.getRow(2);
  headers.forEach((h, i) => {
    const col = i + 1;
    const cell = headerRow.getCell(col);
    cell.value = h.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF059669" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF047857" } },
    };

    sheet.getColumn(col).width = h.width;
  });
  headerRow.height = 28;

  // 5. Data Validation — Dropdown Kategori (kolom C, baris 3 - 1000)
  if (categoryNames.length > 0) {
    const formulae = [`"${categoryNames.join(",")}"`];

    for (let row = 3; row <= 1000; row++) {
      sheet.getCell(`C${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: formulae,
        showErrorMessage: true,
        errorTitle: "Kategori Tidak Valid",
        error: "Silakan pilih kategori dari daftar dropdown.",
      };
    }
  }

  // 6. Data Validation — Dropdown Satuan (kolom E, baris 3 - 1000)
  const satuanList = ["pcs", "kg", "gr", "liter", "pack"];
  for (let row = 3; row <= 1000; row++) {
    sheet.getCell(`E${row}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${satuanList.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Satuan Tidak Valid",
      error: "Silakan pilih satuan dari daftar dropdown.",
    };
  }

  // 7. Data Validation — Dropdown Tanpa Barcode (kolom H, baris 3 - 1000)
  for (let row = 3; row <= 1000; row++) {
    sheet.getCell(`H${row}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Ya,Tidak"'],
      showErrorMessage: true,
      errorTitle: "Nilai Tidak Valid",
      error: 'Silakan pilih "Ya" atau "Tidak".',
    };
  }

  // 8. Format kolom numerik
  sheet.getColumn(4).numFmt = "#,##0"; // Harga Jual
  sheet.getColumn(7).numFmt = "0";     // Min Stok

  // 9. Return buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/* ===============================
   IMPORT PRODUCTS FROM EXCEL
================================= */
async function importProducts(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet(1);
  if (!sheet) {
    throw new Error("File Excel tidak memiliki worksheet.");
  }

  // Query semua kategori untuk lookup
  const categories = db
    .prepare(
      `
      SELECT id, name
      FROM categories
      ORDER BY name COLLATE NOCASE ASC
    `,
    )
    .all();

  const categoryMap = {};
  categories.forEach((c) => {
    categoryMap[c.name.toLowerCase().trim()] = c.id;
  });

  // Siapkan prepared statements
  const insertStmt = db.prepare(`
    INSERT INTO products (
      id, no_sku, barcode, name, category_id, selling_price, unit, min_stock, is_non_barcode, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const updateStmt = db.prepare(`
    UPDATE products
    SET
      name = ?,
      barcode = ?,
      category_id = ?,
      selling_price = ?,
      unit = ?,
      min_stock = ?,
      is_non_barcode = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE no_sku = ?
  `);

  const findBySku = db.prepare(`
    SELECT id FROM products WHERE no_sku = ?
  `);

  // Kumpulkan baris data (mulai baris 3, karena baris 1 = keterangan, baris 2 = header)
  // Kolom: A=No SKU, B=Nama Barang, C=Kategori, D=Harga Jual, E=Satuan, F=Barcode, G=Min Stok, H=Tanpa Barcode
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // Skip keterangan & header

    const noSku = row.getCell(1).text?.trim() || "";
    const name = row.getCell(2).text?.trim() || "";
    const category = row.getCell(3).text?.trim() || "";
    const sellingPrice = parseInt(row.getCell(4).value, 10) || 0;
    const unit = row.getCell(5).text?.trim().toLowerCase() || "pcs";
    const barcode = row.getCell(6).text?.trim() || "";
    const minStockRaw = row.getCell(7).value;
    const minStock =
      minStockRaw !== null && minStockRaw !== undefined && minStockRaw !== ""
        ? parseInt(minStockRaw, 10)
        : 5; // Default 5
    const nonBarcodeText = row.getCell(8).text?.trim().toLowerCase() || "";
    const isNonBarcode = nonBarcodeText === "ya" ? 1 : 0;

    // Skip baris kosong
    if (!name) return;

    rows.push({ noSku, name, category, sellingPrice, unit, barcode, minStock, isNonBarcode });
  });

  if (rows.length === 0) {
    throw new Error("Tidak ada data barang yang valid di file Excel.");
  }

  // Proses dalam transaksi
  let inserted = 0;
  let updated = 0;
  const errors = [];

  const runImport = db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      const { noSku, name, category, sellingPrice, unit, barcode, minStock, isNonBarcode } =
        rows[i];
      const rowNum = i + 3; // nomor baris Excel

      // Cari category_id
      const categoryId = category
        ? categoryMap[category.toLowerCase().trim()] || null
        : null;

      if (category && !categoryId) {
        errors.push(
          `Baris ${rowNum}: Kategori "${category}" tidak ditemukan.`,
        );
        continue;
      }

      try {
        if (!noSku) {
          // === BARANG BARU: Generate SKU, insert ===
          const newSku = generateSKU();
          const newId = crypto.randomUUID();

          insertStmt.run(
            newId,
            newSku,
            barcode || null,
            name,
            categoryId,
            sellingPrice,
            unit,
            minStock,
            isNonBarcode,
          );
          inserted++;
        } else {
          // === CEK APAKAH SKU SUDAH ADA ===
          const existing = findBySku.get(noSku);

          if (!existing) {
            // SKU diisi tapi tidak ditemukan → insert sebagai baru dengan SKU tersebut
            const newId = crypto.randomUUID();
            insertStmt.run(
              newId,
              noSku,
              barcode || null,
              name,
              categoryId,
              sellingPrice,
              unit,
              minStock,
              isNonBarcode,
            );
            inserted++;
          } else {
            // SKU ditemukan → update
            updateStmt.run(
              name,
              barcode || null,
              categoryId,
              sellingPrice,
              unit,
              minStock,
              isNonBarcode,
              noSku,
            );
            updated++;
          }
        }
      } catch (err) {
        errors.push(`Baris ${rowNum}: ${err.message}`);
      }
    }
  });

  runImport();

  return { inserted, updated, errors };
}

/* ===============================
   GENERATE STOCK TEMPLATE EXCEL
   (Pre-filled with existing products)
================================= */
async function generateStockTemplate() {
  // Query semua produk aktif
  const products = db
    .prepare(
      `
      SELECT p.no_sku, p.name, p.unit
      FROM products p
      WHERE p.is_active = 1
      ORDER BY p.name COLLATE NOCASE ASC
    `,
    )
    .all();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "POS Kasir";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Template Import Stok");

  // Baris 1 — Keterangan
  sheet.mergeCells("A1:F1");
  const infoCell = sheet.getCell("A1");
  infoCell.value =
    '📌 Kolom "No SKU", "Nama Barang", dan "Satuan" sudah terisi dari database. Isi kolom "Jumlah Stok", "Harga Modal", dan "Tanggal Stok" untuk barang yang ingin ditambah stoknya. Baris yang Jumlah Stok-nya kosong akan di-skip.';
  infoCell.font = {
    italic: true,
    color: { argb: "FF2563EB" },
    size: 11,
  };
  infoCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFDBEAFE" },
  };
  infoCell.alignment = {
    vertical: "middle",
    wrapText: true,
  };
  sheet.getRow(1).height = 40;

  // Baris 2 — Header
  const headers = [
    { header: "No SKU", width: 18 },
    { header: "Nama Barang", width: 30 },
    { header: "Satuan", width: 12 },
    { header: "Jumlah Stok", width: 15 },
    { header: "Harga Modal", width: 18 },
    { header: "Tanggal Stok (YYYY-MM-DD)", width: 26 },
  ];

  const headerRow = sheet.getRow(2);
  headers.forEach((h, i) => {
    const col = i + 1;
    const cell = headerRow.getCell(col);
    cell.value = h.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF059669" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF047857" } },
    };
    sheet.getColumn(col).width = h.width;
  });
  headerRow.height = 28;

  // Baris 3+ — Data produk (pre-filled, kolom stok dikosongkan)
  products.forEach((product, i) => {
    const row = sheet.getRow(i + 3);
    row.getCell(1).value = product.no_sku || "";
    row.getCell(2).value = product.name || "";
    row.getCell(3).value = product.unit || "pcs";
    // Kolom 4 (Jumlah), 5 (Harga Modal), 6 (Tanggal) dikosongkan

    // Lock kolom referensi (visual: abu-abu)
    for (let c = 1; c <= 3; c++) {
      row.getCell(c).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF1F5F9" },
      };
      row.getCell(c).font = { color: { argb: "FF64748B" }, size: 11 };
    }
  });

  // Format kolom numerik
  sheet.getColumn(4).numFmt = "#,##0";    // Jumlah Stok
  sheet.getColumn(5).numFmt = "#,##0";    // Harga Modal
  sheet.getColumn(6).numFmt = "@";        // Tanggal sebagai text

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/* ===============================
   IMPORT STOCK FROM EXCEL
================================= */
async function importStock(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet(1);
  if (!sheet) {
    throw new Error("File Excel tidak memiliki worksheet.");
  }

  // Prepared statements
  const findProductBySku = db.prepare(`
    SELECT id, is_active FROM products WHERE no_sku = ?
  `);

  const insertBatch = db.prepare(`
    INSERT INTO stock_batches (
      id, product_id, stock_date, quantity_initial, quantity_remaining, cost_price
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Parse rows (mulai baris 3)
  // Kolom: A=No SKU, B=Nama Barang, C=Satuan, D=Jumlah Stok, E=Harga Modal, F=Tanggal Stok
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return;

    const noSku = row.getCell(1).text?.trim() || "";
    const qtyRaw = row.getCell(4).value;
    const costRaw = row.getCell(5).value;
    const dateCell = row.getCell(6);
    const dateValue = dateCell.value;

    // Skip baris yang jumlah stoknya kosong
    const qty = parseFloat(qtyRaw);
    if (!noSku || isNaN(qty) || qty <= 0) return;

    const costPrice = parseInt(costRaw, 10) || 0;

    // Parsing tanggal: Excel bisa simpan sebagai Date object atau string
    let stockDate;
    if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
      // Excel Date object → konversi ke YYYY-MM-DD
      const y = dateValue.getFullYear();
      const m = String(dateValue.getMonth() + 1).padStart(2, "0");
      const d = String(dateValue.getDate()).padStart(2, "0");
      stockDate = `${y}-${m}-${d}`;
    } else {
      const dateText = (dateCell.text || "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
        stockDate = dateText;
      } else {
        const now = new Date();
        stockDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      }
    }

    rows.push({ noSku, qty, costPrice, stockDate, rowNum: rowNumber });
  });

  if (rows.length === 0) {
    throw new Error("Tidak ada data stok yang valid di file Excel.");
  }

  let inserted = 0;
  const errors = [];

  const runImport = db.transaction(() => {
    for (const { noSku, qty, costPrice, stockDate, rowNum } of rows) {
      try {
        const product = findProductBySku.get(noSku);

        if (!product) {
          errors.push(`Baris ${rowNum}: No SKU "${noSku}" tidak ditemukan.`);
          continue;
        }

        if (!product.is_active) {
          errors.push(`Baris ${rowNum}: Produk "${noSku}" sedang nonaktif.`);
          continue;
        }

        if (costPrice <= 0) {
          errors.push(`Baris ${rowNum}: Harga modal harus lebih dari 0.`);
          continue;
        }

        const id = crypto.randomUUID();
        insertBatch.run(id, product.id, stockDate, qty, qty, costPrice);
        inserted++;
      } catch (err) {
        errors.push(`Baris ${rowNum}: ${err.message}`);
      }
    }
  });

  runImport();

  return { inserted, errors };
}

module.exports = {
  generateTemplate,
  generateSKU,
  importProducts,
  generateStockTemplate,
  importStock,
};
