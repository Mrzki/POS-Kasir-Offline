(() => {
  const STYLE_ID = "receipt-renderer-style";
  const LINE_WIDTH = 23; // 58mm thermal paper, disesuaikan untuk font 13px
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
      // Database stores UTC time (via toISOString), append 'Z' so JS
      // converts to local timezone when displaying hours/minutes.
      const withTz = /[Z+\-]\d{0,2}:?\d{0,2}$/.test(normalized)
        ? normalized
        : normalized + "Z";
      d = new Date(withTz);
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
        transactionData.storeTagline ?? "Toko Kelontong&Sembako",
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

  // Right-aligned summary: "      LABEL :   AMOUNT"
  function summaryRow(label, amount, w = LINE_WIDTH) {
    const amtStr = formatAmount(amount);
    const right = `${label} :${amtStr.padStart(9)}`;
    return right.padStart(w);
  }

  // Item: 2-line format for 32-char width
  // Line 1: ITEM NAME (full width, truncated)
  // Line 2:   QTY x PRICE         SUBTOTAL
  function itemLines(item, w = LINE_WIDTH) {
    const lines = [];
    const name = item.name.toUpperCase();
    lines.push(name.length > w ? name.substring(0, w) : name);

    const left = `  ${item.quantity} x ${formatAmount(item.sellingPrice)}`;
    const right = formatAmount(item.subtotal);
    const gap = w - left.length - right.length;
    const line2 =
      gap > 0
        ? left + " ".repeat(gap) + right
        : left + " " + right;
    lines.push(line2);

    return lines;
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
    L.push(center(data.storeName.toUpperCase()));
    L.push(center(data.storeTagline.toUpperCase()));
    // Word-wrap address if needed
    wordWrap(data.storeAddress.toUpperCase(), LINE_WIDTH).forEach((line) =>
      L.push(center(line)),
    );

    // ── Transaction info ──
    L.push(dashes());
    const txLine = `${data.transactionDate}/${data.transactionNumber}`;
    // Word-wrap transaction line if it exceeds width
    if (txLine.length <= LINE_WIDTH) {
      L.push(center(txLine.toUpperCase()));
    } else {
      L.push(center(data.transactionDate));
      L.push(center(data.transactionNumber.toUpperCase()));
    }
    L.push(dashes());

    // ── Items ──
    if (!data.items.length) {
      L.push(center("(BELUM ADA ITEM)"));
    } else {
      data.items.forEach((item) => {
        itemLines(item).forEach((line) => L.push(line));
      });
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

    // ── Bottom margin for tear ──
    // Add empty lines so the footer doesn't get cut when tearing
    for (let i = 0; i < 15; i++) L.push("");

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
        padding: 2px;
        background: #fff;
        color: #000;
      }

      .receipt-render pre {
        font-family: "Roboto Mono", Consolas, "Courier New", monospace;
        font-size: 13px;
        line-height: 1.2;
        margin: 0;
        padding: 0;
        white-space: pre;
        overflow: hidden;
        letter-spacing: 0;
      }

      @media print {
        @page {
          size: 58mm auto;
          margin: 0 !important;
        }

        html, body {
          width: 58mm;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff;
        }

        .receipt-render {
          width: 100% !important;
          margin: 0 !important;
          padding: 0 0 80mm 0 !important;
          box-sizing: border-box;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .receipt-render pre {
          font-size: 13px;
          line-height: 1.2;
          margin: 0;
          padding: 0;
        }

        .receipt-tear-spacer {
          color: #fff;
          font-family: "Roboto Mono", monospace;
          font-size: 9px;
          line-height: 1.15;
          margin: 0;
          padding: 0;
          white-space: pre;
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

    // Spacer untuk ruang potong kertas thermal
    // Menggunakan div dengan height eksplisit + pre dengan banyak newline
    // agar printer thermal pasti feed kertas
    const spacer = doc.createElement("div");
    spacer.style.cssText = "height: 150px; width: 100%; background: #fff;";
    wrapper.appendChild(spacer);

    const feedLines = doc.createElement("pre");
    feedLines.style.cssText = "margin:0; padding:0; font-size:13px; line-height:1.2; color:#fff; white-space:pre;";
    feedLines.textContent = "\n".repeat(40);
    wrapper.appendChild(feedLines);

    containerElement.innerHTML = "";
    containerElement.appendChild(wrapper);
  }

  window.renderReceipt = renderReceipt;
  window.receiptRenderer = { renderReceipt, formatRupiah };
})();
