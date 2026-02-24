(() => {
  const STYLE_ID = "receipt-renderer-style";

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatRupiah(value) {
    return `Rp ${toNumber(value).toLocaleString("id-ID")}`;
  }

  function formatAmountCompact(value) {
    return toNumber(value).toLocaleString("id-ID");
  }

  function formatDateTime(value) {
    if (!value) {
      return new Date().toLocaleString("id-ID");
    }

    if (value instanceof Date) {
      return value.toLocaleString("id-ID");
    }

    const normalized = String(value).replace(" ", "T");
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return String(value);
    }

    return parsed.toLocaleString("id-ID");
  }

  function normalizeItem(item) {
    const quantity = Math.max(
      0,
      Math.trunc(toNumber(item?.quantity ?? item?.qty ?? 0)),
    );
    const sellingPrice = toNumber(
      item?.selling_price ?? item?.sellingPrice ?? item?.price ?? 0,
    );
    const subtotal = toNumber(item?.subtotal ?? quantity * sellingPrice);

    return {
      name: String(item?.name ?? "-"),
      quantity,
      sellingPrice,
      subtotal,
    };
  }

  function normalizeReceiptData(transactionData = {}) {
    const items = Array.isArray(transactionData.items)
      ? transactionData.items.map(normalizeItem)
      : [];

    return {
      storeName: String(transactionData.storeName ?? "TOKO SANJAYA BAROKAH"),
      storeTagline: String(
        transactionData.storeTagline ?? "Toko Kelontong & Sembako",
      ),
      storeAddress: String(
        transactionData.storeAddress ?? "Sanan, Balesono - Tulungagung",
      ),
      transactionNumber: String(transactionData.transactionNumber ?? "-"),
      transactionDate: formatDateTime(transactionData.transactionDate),
      items,
      totalAmount: toNumber(transactionData.totalAmount),
      paymentAmount: toNumber(transactionData.paymentAmount),
      changeAmount: toNumber(transactionData.changeAmount),
      footerLine1: String(transactionData.footerLine1 ?? "Terima Kasih"),
      footerLine2: String(
        transactionData.footerLine2 ??
          "Barang yang sudah dibeli tidak dapat dikembalikan",
      ),
    };
  }

  function renderReceiptItems(containerElement, items) {
    containerElement.innerHTML = "";

    if (!items.length) {
      const emptyEl = containerElement.ownerDocument.createElement("div");
      emptyEl.className = "receipt-item-empty";
      emptyEl.textContent = "(Belum ada item)";
      containerElement.appendChild(emptyEl);
      return;
    }

    items.forEach((item) => {
      const itemEl = containerElement.ownerDocument.createElement("div");
      itemEl.className = "receipt-item";

      const nameEl = containerElement.ownerDocument.createElement("div");
      nameEl.className = "receipt-item-name";
      nameEl.textContent = item.name;

      const metaEl = containerElement.ownerDocument.createElement("div");
      metaEl.className = "receipt-item-meta";

      const leftEl = containerElement.ownerDocument.createElement("span");
      leftEl.className = "receipt-item-left";
      leftEl.textContent = `${item.quantity} x ${formatAmountCompact(item.sellingPrice)}`;

      const rightEl = containerElement.ownerDocument.createElement("span");
      rightEl.className = "receipt-item-right";
      rightEl.textContent = formatAmountCompact(item.subtotal);

      metaEl.append(leftEl, rightEl);
      itemEl.append(nameEl, metaEl);
      containerElement.appendChild(itemEl);
    });
  }

  function ensureReceiptStyle(doc) {
    if (!doc || !doc.head || doc.getElementById(STYLE_ID)) {
      return;
    }

    const styleEl = doc.createElement("style");
    styleEl.id = STYLE_ID;
    styleEl.textContent = `
      .receipt-render {
        width: var(--receipt-width, 200px);
        max-width: 100%;
        margin: 0 auto;
        padding: 5px;
        background: #ffffff;
        color: #000000;
        font-family: "Courier New", Consolas, monospace;
        font-size: 11px;
        line-height: 1.35;
      }

      .receipt-render .receipt-center {
        text-align: center;
      }

      .receipt-render .receipt-bold {
        font-weight: 700;
      }

      .receipt-render .receipt-small {
        font-size: 10px;
      }

      .receipt-render .receipt-divider {
        border-top: 1px dashed #000000;
        margin: 5px 0;
      }

      .receipt-render .receipt-items {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .receipt-render .receipt-item {
        border-bottom: 1px dashed #000000;
        padding-bottom: 6px;
      }

      .receipt-render .receipt-item:last-child {
        border-bottom: none;
        padding-bottom: 0;
      }

      .receipt-render .receipt-item-name {
        margin: 0;
        overflow-wrap: anywhere;
      }

      .receipt-render .receipt-item-meta {
        margin-top: 2px;
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
      }

      .receipt-render .receipt-item-left {
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .receipt-render .receipt-item-right {
        white-space: nowrap;
        text-align: right;
      }

      .receipt-render .receipt-item-empty {
        color: #333333;
      }

      .receipt-render .receipt-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
      }

      .receipt-render .receipt-row .receipt-right {
        text-align: right;
      }

      @media print {
        body {
          margin: 0;
          padding: 0;
          background: #ffffff;
        }

        .receipt-render {
          width: 100% !important;
          max-width: 219px;
          margin: 0;
          padding: 2mm;
          font-size: 12px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .receipt-render .receipt-divider {
          border-top-color: #000000;
        }
      }
    `;

    doc.head.appendChild(styleEl);
  }

  function renderReceipt(containerElement, transactionData = {}) {
    if (!containerElement || !(containerElement instanceof Element)) {
      throw new Error("containerElement harus elemen DOM.");
    }

    const doc = containerElement.ownerDocument;
    ensureReceiptStyle(doc);

    const data = normalizeReceiptData(transactionData);

    containerElement.innerHTML = `
      <div class="receipt-render">
        <div class="receipt-center receipt-bold" data-receipt-store-name></div>
        <div class="receipt-center receipt-small" data-receipt-store-tagline></div>
        <div class="receipt-center receipt-small" data-receipt-store-address></div>

        <div class="receipt-divider"></div>

        <div>No: <span data-receipt-number></span></div>
        <div>Tanggal: <span data-receipt-date></span></div>

        <div class="receipt-divider"></div>

        <div class="receipt-items" data-receipt-items></div>

        <div class="receipt-divider"></div>

        <div class="receipt-row">
          <span>Total</span>
          <span class="receipt-right" data-receipt-total></span>
        </div>
        <div class="receipt-row">
          <span>Bayar</span>
          <span class="receipt-right" data-receipt-payment></span>
        </div>
        <div class="receipt-row">
          <span>Kembali</span>
          <span class="receipt-right" data-receipt-change></span>
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-center" data-receipt-footer-line-1></div>
        <div class="receipt-center receipt-small" data-receipt-footer-line-2></div>
      </div>
    `;

    const root = containerElement.querySelector(".receipt-render");
    root.querySelector("[data-receipt-store-name]").textContent = data.storeName;
    root.querySelector("[data-receipt-store-tagline]").textContent = data.storeTagline;
    root.querySelector("[data-receipt-store-address]").textContent = data.storeAddress;
    root.querySelector("[data-receipt-number]").textContent = data.transactionNumber;
    root.querySelector("[data-receipt-date]").textContent = data.transactionDate;
    renderReceiptItems(root.querySelector("[data-receipt-items]"), data.items);
    root.querySelector("[data-receipt-total]").textContent = formatRupiah(data.totalAmount);
    root.querySelector("[data-receipt-payment]").textContent = formatRupiah(
      data.paymentAmount,
    );
    root.querySelector("[data-receipt-change]").textContent = formatRupiah(
      data.changeAmount,
    );
    root.querySelector("[data-receipt-footer-line-1]").textContent = data.footerLine1;
    root.querySelector("[data-receipt-footer-line-2]").textContent = data.footerLine2;
  }

  window.renderReceipt = renderReceipt;
  window.receiptRenderer = {
    renderReceipt,
    formatRupiah,
  };
})();
