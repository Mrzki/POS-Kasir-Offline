(() => {
  const STYLE_ID = "receipt-renderer-style";
  const LINE_WIDTH = 42;
  const DASH = "-";

  // ──── Utility ────

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatRupiah(value) {
    return `Rp ${toNumber(value).toLocaleString("id-ID")}`;
  }

  function formatAmount(value) {
    return toNumber(value).toLocaleString("id-ID");
  }

  function formatDateIndomaret(value) {
    let d;
    if (!value) {
      d = new Date();
    } else if (value instanceof Date) {
      d = value;
    } else {
      const normalized = String(value).replace(" ", "T");
      d = new Date(normalized);
      if (Number.isNaN(d.getTime())) return String(value);
    }
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}.${mm}.${yy}-${hh}:${mi}`;
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
    return { name: String(item?.name ?? "-"), quantity, sellingPrice, subtotal };
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
      transactionDate: formatDateIndomaret(transactionData.transactionDate),
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

  // ──── Text layout helpers ────

  function center(text, w = LINE_WIDTH) {
    if (text.length >= w) return text.substring(0, w);
    const pad = Math.floor((w - text.length) / 2);
    return " ".repeat(pad) + text;
  }

  function dashes(w = LINE_WIDTH) {
    return DASH.repeat(w);
  }

  function shortDashes(w = LINE_WIDTH) {
    const len = Math.floor(w * 0.55);
    return " ".repeat(w - len) + DASH.repeat(len);
  }

  // "           LABEL :    AMOUNT" — right-aligned summary row
  function summaryRow(label, amount, w = LINE_WIDTH) {
    const amtStr = formatAmount(amount);
    const right = `${label} :${amtStr.padStart(10)}`;
    return right.padStart(w);
  }

  // 1-line item: NAME(21) QTY(4) PRICE(7) SUBTOTAL(10) = 42
  function itemLine(item, w = LINE_WIDTH) {
    const qtyStr = String(item.quantity).padStart(4);
    const priceStr = String(item.sellingPrice).padStart(7);
    const subStr = formatAmount(item.subtotal).padStart(10);
    const rightPart = qtyStr + priceStr + subStr;
    const nameW = w - rightPart.length;
    const name = item.name.toUpperCase();
    const display =
      name.length > nameW ? name.substring(0, nameW) : name.padEnd(nameW);
    return display + rightPart;
  }

  // Word-wrap long text into multiple lines
  function wordWrap(text, maxW) {
    const words = text.split(/\s+/);
    const lines = [];
    let cur = "";
    for (const word of words) {
      if (!cur) {
        cur = word;
      } else if (cur.length + 1 + word.length <= maxW) {
        cur += " " + word;
      } else {
        lines.push(cur);
        cur = word;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // ──── Build receipt text ────

  function buildReceiptText(data) {
    const L = [];

    // ── Header ──
    L.push(dashes());
    L.push(center(data.storeName.toUpperCase()));
    L.push(center(data.storeTagline.toUpperCase()));
    L.push(center(data.storeAddress.toUpperCase()));

    // ── Transaction info ──
    L.push(dashes());
    const txLine = `${data.transactionDate}/${data.transactionNumber}`;
    L.push(center(txLine.toUpperCase()));
    L.push(dashes());

    // ── Items ──
    if (!data.items.length) {
      L.push(center("(BELUM ADA ITEM)"));
    } else {
      data.items.forEach((item) => L.push(itemLine(item)));
    }

    // ── Summary ──
    L.push(shortDashes());
    L.push(summaryRow("HARGA JUAL", data.totalAmount));
    L.push(shortDashes());
    L.push(summaryRow("TOTAL", data.totalAmount));
    L.push(summaryRow("TUNAI", data.paymentAmount));
    L.push(summaryRow("KEMBALI", data.changeAmount));

    // ── Footer ──
    L.push(dashes());
    L.push(center(data.footerLine1.toUpperCase()));
    const f2 = data.footerLine2.toUpperCase();
    wordWrap(f2, LINE_WIDTH).forEach((line) => L.push(center(line)));

    return L.join("\n");
  }

  // ──── CSS ────

  function ensureReceiptStyle(doc) {
    if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;

    const s = doc.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
      .receipt-render {
        width: var(--receipt-width, auto);
        max-width: 100%;
        margin: 0 auto;
        padding: 5px;
        background: #fff;
        color: #000;
      }

      .receipt-render pre {
        font-family: "Courier New", Consolas, monospace;
        font-size: 11px;
        line-height: 1.15;
        margin: 0;
        padding: 0;
        white-space: pre;
        overflow: hidden;
        letter-spacing: 0;
      }

      @media print {
        body {
          margin: 0;
          padding: 0;
          background: #fff;
        }

        .receipt-render {
          width: auto !important;
          margin: 0;
          padding: 2mm;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .receipt-render pre {
          font-size: 12px;
        }
      }
    `;
    doc.head.appendChild(s);
  }

  // ──── Render ────

  function renderReceipt(containerElement, transactionData = {}) {
    if (!containerElement || !(containerElement instanceof Element)) {
      throw new Error("containerElement harus elemen DOM.");
    }

    const doc = containerElement.ownerDocument;
    ensureReceiptStyle(doc);

    const data = normalizeReceiptData(transactionData);
    const text = buildReceiptText(data);

    // Build DOM safely (textContent auto-escapes)
    const wrapper = doc.createElement("div");
    wrapper.className = "receipt-render";
    const pre = doc.createElement("pre");
    pre.textContent = text;
    wrapper.appendChild(pre);

    containerElement.innerHTML = "";
    containerElement.appendChild(wrapper);
  }

  window.renderReceipt = renderReceipt;
  window.receiptRenderer = { renderReceipt, formatRupiah };
})();
