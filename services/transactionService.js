const db = require("../database/db");
const crypto = require("crypto");

function checkStock(productId) {
  const row = db
    .prepare(
      `
    SELECT COALESCE(SUM(quantity_remaining), 0) as total_stock
    FROM stock_batches
    WHERE product_id = ?
  `,
    )
    .get(productId);

  return {
    totalStock: row.total_stock,
  };
}

function generateTransactionNumber() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `TRX-${datePart}-${randomPart}`;
}

function processSale(cartItems, paymentAmount) {
  const transactionId = crypto.randomUUID();
  const transactionNumber = generateTransactionNumber();

  let totalAmount = 0;
  let totalProfit = 0;

  const transaction = db.transaction(() => {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    db.prepare(
      `
      INSERT INTO transactions (
        id,
        transaction_number,
        total_amount,
        total_profit,
        payment_amount,
        change_amount,
        type,
        created_at
      ) VALUES (?, ?, 0, 0, ?, 0, 'sale', ?)
    `,
    ).run(transactionId, transactionNumber, paymentAmount, now);

    for (const item of cartItems) {
      const stockRow = db
        .prepare(
          `
        SELECT COALESCE(SUM(quantity_remaining), 0) as total_stock
        FROM stock_batches
        WHERE product_id = ?
      `,
        )
        .get(item.product_id);

      if (stockRow.total_stock < item.quantity) {
        throw new Error(`Stok tidak cukup untuk produk ID ${item.product_id}`);
      }

      let remainingQty = item.quantity;

      const batches = db
        .prepare(
          `
        SELECT *
        FROM stock_batches
        WHERE product_id = ?
          AND quantity_remaining > 0
        ORDER BY created_at ASC
      `,
        )
        .all(item.product_id);

      for (const batch of batches) {
        if (remainingQty <= 0) break;

        const qtyFromBatch = Math.min(remainingQty, batch.quantity_remaining);
        const subtotal = qtyFromBatch * item.selling_price;
        const profit = (item.selling_price - batch.cost_price) * qtyFromBatch;

        totalAmount += subtotal;
        totalProfit += profit;

        db.prepare(
          `
          INSERT INTO transaction_items (
            id,
            transaction_id,
            product_id,
            batch_id,
            quantity,
            selling_price,
            cost_price,
            subtotal,
            profit
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          crypto.randomUUID(),
          transactionId,
          item.product_id,
          batch.id,
          qtyFromBatch,
          item.selling_price,
          batch.cost_price,
          subtotal,
          profit,
        );

        db.prepare(
          `
          UPDATE stock_batches
          SET quantity_remaining = quantity_remaining - ?
          WHERE id = ?
        `,
        ).run(qtyFromBatch, batch.id);

        remainingQty -= qtyFromBatch;
      }
    }

    const changeAmount = paymentAmount - totalAmount;

    db.prepare(
      `
      UPDATE transactions
      SET total_amount = ?,
          total_profit = ?,
          change_amount = ?
      WHERE id = ?
    `,
    ).run(totalAmount, totalProfit, changeAmount, transactionId);
  });

  transaction();

  return {
    transactionId,
    transactionNumber,
    totalAmount,
    totalProfit,
  };
}

function getTransactionDetail(transactionId) {
  const transaction = db
    .prepare(
      `
      SELECT *
      FROM transactions
      WHERE id = ?
    `,
    )
    .get(transactionId);

  if (!transaction) {
    throw new Error("Transaksi tidak ditemukan");
  }

  const items = db
    .prepare(
      `
      SELECT 
        ti.*,
        COALESCE(p.name, ti.name, 'Item Manual') AS name
      FROM transaction_items ti
      LEFT JOIN products p ON p.id = ti.product_id
      WHERE ti.transaction_id = ?
    `,
    )
    .all(transactionId);

  return {
    transaction,
    items,
  };
}

function voidTransaction(originalTransactionId) {
  const voidTransactionId = crypto.randomUUID();
  const voidTransactionNumber = generateTransactionNumber();

  let totalAmount = 0;
  let totalProfit = 0;

  const transaction = db.transaction(() => {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const today = now.slice(0, 10);

    const originalTransaction = db
      .prepare(
        `
      SELECT * FROM transactions
      WHERE id = ?
    `,
      )
      .get(originalTransactionId);

    if (!originalTransaction) {
      throw new Error("Transaksi tidak ditemukan");
    }

    if (originalTransaction.type !== "sale") {
      throw new Error("Hanya transaksi sale yang dapat di-void");
    }

    if (String(originalTransaction.created_at || "").slice(0, 10) !== today) {
      throw new Error("Void hanya bisa untuk transaksi hari ini");
    }

    const existingVoid = db
      .prepare(
        `
      SELECT id
      FROM transactions
      WHERE type = 'void'
        AND reference_transaction_id = ?
      LIMIT 1
    `,
      )
      .get(originalTransactionId);

    if (existingVoid) {
      throw new Error("Transaksi ini sudah di-void");
    }

    // Kompatibilitas skema lama yang masih punya kolom is_voided.
    try {
      db.prepare(
        `
        UPDATE transactions
        SET is_voided = 1
        WHERE id = ?
      `,
      ).run(originalTransactionId);
    } catch (error) {
      if (!/no such column: is_voided/i.test(String(error?.message || ""))) {
        throw error;
      }
    }

    db.prepare(
      `
      INSERT INTO transactions (
        id,
        transaction_number,
        total_amount,
        total_profit,
        payment_amount,
        change_amount,
        type,
        reference_transaction_id,
        created_at
      ) VALUES (?, ?, 0, 0, 0, 0, 'void', ?, ?)
    `,
    ).run(voidTransactionId, voidTransactionNumber, originalTransactionId, now);

    const items = db
      .prepare(
        `
      SELECT * FROM transaction_items
      WHERE transaction_id = ?
    `,
      )
      .all(originalTransactionId);

    for (const item of items) {
      // Only restore stock if batch_id exists (non-barcode items have NULL batch_id)
      if (item.batch_id) {
        db.prepare(
          `
          UPDATE stock_batches
          SET quantity_remaining = quantity_remaining + ?
          WHERE id = ?
        `,
        ).run(item.quantity, item.batch_id);
      }

      const negativeSubtotal = -Number(item.subtotal || 0);
      const negativeProfit = -Number(item.profit || 0);
      const negativeQty = -Number(item.quantity || 0);

      totalAmount += negativeSubtotal;
      totalProfit += negativeProfit;

      db.prepare(
        `
        INSERT INTO transaction_items (
          id,
          transaction_id,
          product_id,
          batch_id,
          quantity,
          selling_price,
          cost_price,
          subtotal,
          profit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        crypto.randomUUID(),
        voidTransactionId,
        item.product_id,
        item.batch_id,
        negativeQty,
        item.selling_price,
        item.cost_price,
        negativeSubtotal,
        negativeProfit,
      );
    }

    db.prepare(
      `
      UPDATE transactions
      SET total_amount = ?,
          total_profit = ?
      WHERE id = ?
    `,
    ).run(totalAmount, totalProfit, voidTransactionId);
  });

  transaction();

  return {
    voidTransactionId,
    voidTransactionNumber,
  };
}

module.exports = {
  checkStock,
  processSale,
  getTransactionDetail,
  voidTransaction,
};
