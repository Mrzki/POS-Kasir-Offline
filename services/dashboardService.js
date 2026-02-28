const db = require("../database/db");

/**
 * Ringkasan dashboard per hari
 * HANYA transaksi sale yang BELUM void
 */
function getDailySummary(date) {
  const row = db
    .prepare(
      `
    SELECT
      COUNT(*) AS total_transactions,
      COALESCE(SUM(total_amount), 0) AS total_revenue,
      COALESCE(SUM(total_profit), 0) AS total_profit
    FROM transactions
    WHERE substr(datetime(created_at, '+7 hours'), 1, 10) = DATE(?)
      AND type = 'sale'
      AND is_voided = 0
  `,
    )
    .get(date);

  return {
    totalTransactions: row.total_transactions,
    totalRevenue: row.total_revenue,
    totalProfit: row.total_profit,
  };
}

/**
 * Grafik transaksi per jam (setiap jam 00–23)
 * HANYA transaksi sale yang BELUM void
 */
function getHourlyAnalytics(date) {
  const rows = db
    .prepare(
      `
    SELECT
      CAST(strftime('%H', datetime(created_at, '+7 hours')) AS INTEGER) AS hour,
      COUNT(*) AS total_transactions,
      COALESCE(SUM(total_amount), 0) AS revenue,
      COALESCE(SUM(total_profit), 0) AS profit
    FROM transactions
    WHERE substr(datetime(created_at, '+7 hours'), 1, 10) = DATE(?)
      AND type = 'sale'
      AND is_voided = 0
    GROUP BY hour
  `,
    )
    .all(date);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return hours.map((h) => {
    const match = rows.find((r) => r.hour === h);

    return {
      hour: `${String(h).padStart(2, "0")}:00`,
      transactions: match ? match.total_transactions : 0,
      revenue: match ? match.revenue : 0,
      profit: match ? match.profit : 0,
    };
  });
}

/**
 * Top produk berdasarkan qty terjual
 * HANYA transaksi sale yang BELUM void
 */
function getTopProducts(date, limit = 5) {
  return db
    .prepare(
      `
    SELECT
      p.name AS product_name,
      SUM(ti.quantity) AS total_qty
    FROM transaction_items ti
    JOIN transactions t ON t.id = ti.transaction_id
    JOIN products p ON p.id = ti.product_id
    WHERE substr(datetime(t.created_at, '+7 hours'), 1, 10) = DATE(?)
      AND t.type = 'sale'
      AND t.is_voided = 0
    GROUP BY p.id
    ORDER BY total_qty DESC
    LIMIT ?
  `,
    )
    .all(date, limit);
}

/**
 * Produk dengan stok hampir habis (total_stock <= min_stock)
 * Hanya produk aktif yang ditampilkan
 */
function getLowStockProducts(limit = 10) {
  return db
    .prepare(
      `
    SELECT
      p.name AS product_name,
      p.unit,
      p.min_stock,
      COALESCE(SUM(sb.quantity_remaining), 0) AS total_stock
    FROM products p
    LEFT JOIN stock_batches sb
      ON sb.product_id = p.id
     AND sb.quantity_remaining > 0
    WHERE p.is_active = 1
    GROUP BY p.id, p.name, p.unit, p.min_stock
    HAVING total_stock <= p.min_stock
    ORDER BY total_stock ASC
    LIMIT ?
  `,
    )
    .all(limit);
}

module.exports = {
  getDailySummary,
  getHourlyAnalytics,
  getTopProducts,
  getLowStockProducts,
};
