const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  navigate: (target) => ipcRenderer.invoke("navigate", target),

  findProductByBarcode: (barcode) =>
    ipcRenderer.invoke("find-product-by-barcode", barcode),

  getEcerProducts: () => ipcRenderer.invoke("get-ecer-products"),

  saveTransaction: (data) => ipcRenderer.invoke("save-transaction", data),

  printReceipt: (transactionId) =>
    ipcRenderer.invoke("print-receipt", transactionId),

  getReportByDate: (date) => ipcRenderer.invoke("get-report-by-date", date),

  openReport: () => ipcRenderer.invoke("open-report"),

  checkStock: (productId) => ipcRenderer.invoke("check-stock", productId),

  processSale: (data) => ipcRenderer.invoke("process-sale", data),

  voidTransaction: (transactionId) =>
    ipcRenderer.invoke("void-transaction", transactionId),

  getDashboardSummary: (date) =>
    ipcRenderer.invoke("dashboard:get-daily-summary", date),

  getDashboardHourly: (date) =>
    ipcRenderer.invoke("dashboard:get-hourly-analytics", date),

  getDashboardTopProducts: (date, limit = 5) =>
    ipcRenderer.invoke("dashboard:get-top-products", { date, limit }),

  openDashboard: () => ipcRenderer.invoke("open-dashboard"),

  getProducts: () => ipcRenderer.invoke("products:get-all"),

  searchProducts: (keyword) => ipcRenderer.invoke("products:search", keyword),

  getProductCategories: () => ipcRenderer.invoke("products:get-categories"),

  createProduct: (data) => ipcRenderer.invoke("products:create", data),

  updateProduct: (id, data) =>
    ipcRenderer.invoke("products:update", { id, data }),
  toggleProductActive: (id) => ipcRenderer.invoke("products:toggle-active", id),

  downloadImportTemplate: () => ipcRenderer.invoke("products:download-template"),
  importProducts: () => ipcRenderer.invoke("products:import-excel"),

  // Stock
  getAllStock: () => ipcRenderer.invoke("stock:get-all"),

  downloadStockTemplate: () => ipcRenderer.invoke("stock:download-template"),
  importStock: () => ipcRenderer.invoke("stock:import-excel"),

  getStock: (productId) => ipcRenderer.invoke("stock:get", productId),

  addStock: (data) => ipcRenderer.invoke("stock:add", data),

  removeStock: (productId, qty) =>
    ipcRenderer.invoke("stock:remove", { productId, qty }),

  updateStockBatch: (batchId, data) =>
    ipcRenderer.invoke("stock:update-batch", { batchId, data }),

  deleteStockBatch: (batchId) =>
    ipcRenderer.invoke("stock:delete-batch", batchId),

  getTransactions: (range) => ipcRenderer.invoke("get-transactions", range),

  getTransactionDetail: (transactionId) =>
    ipcRenderer.invoke("get-transaction-detail", transactionId),

  getSalesSummary: (range) => ipcRenderer.invoke("sales:get-summary", range),

  getSalesProductDetail: (payload) =>
    ipcRenderer.invoke("sales:get-product-detail", payload),

  // Receipt print
  receiptReady: () => ipcRenderer.send("receipt-ready"),
  onLoadTransaction: (callback) =>
    ipcRenderer.on("load-transaction", (_event, transactionId) =>
      callback(transactionId),
    ),
});
