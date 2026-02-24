(() => {
  function initSales() {
    const dateFromInput = document.getElementById("sales-date-from");
    const dateToInput = document.getElementById("sales-date-to");
    const searchInput = document.getElementById("sales-search");
    const messageEl = document.getElementById("sales-message");
    const countEl = document.getElementById("sales-count");
    const totalsEl = document.getElementById("sales-totals");
    const summaryBody = document.getElementById("sales-summary-body");

    const detailModal = document.getElementById("sales-detail-modal");
    const detailCloseIcon = document.getElementById("sales-detail-close-icon");
    const detailCloseButton = document.getElementById("sales-detail-close-btn");
    const detailNameEl = document.getElementById("sales-detail-name");
    const detailCodeEl = document.getElementById("sales-detail-code");
    const detailDateFromInput = document.getElementById("sales-detail-date-from");
    const detailDateToInput = document.getElementById("sales-detail-date-to");
    const detailBody = document.getElementById("sales-detail-body");

    if (
      !dateFromInput ||
      !dateToInput ||
      !searchInput ||
      !messageEl ||
      !countEl ||
      !totalsEl ||
      !summaryBody ||
      !detailModal ||
      !detailCloseIcon ||
      !detailCloseButton ||
      !detailNameEl ||
      !detailCodeEl ||
      !detailDateFromInput ||
      !detailDateToInput ||
      !detailBody
    ) {
      console.error("[Sales] Elemen wajib tidak ditemukan.");
      return () => {};
    }

    const eventController = new AbortController();
    const { signal } = eventController;

    const state = {
      rows: [],
      keyword: "",
      isLoadingSummary: false,
      selectedProduct: null,
      detailRows: [],
      isLoadingDetail: false,
      summaryRequestVersion: 0,
      detailRequestVersion: 0,
      feedbackTimerId: null,
    };

    function formatDateDisplay(date) {
      if (!date) return '';
      const d = date.getDate().toString().padStart(2, '0');
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      const y = date.getFullYear();
      return `${d}-${m}-${y}`;
    }

    // Helper to parse DD-MM-YYYY to YYYY-MM-DD
    function parseDateToISO(str) {
      if (!str) return null;
      const parts = str.split('-');
      if (parts.length !== 3) return null;
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    const todayDate = new Date();
    const monthStartDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    // Main Filter Picker
    const mainPicker = new DateRangePicker({
      initialStartDate: monthStartDate,
      initialEndDate: todayDate,
      onApply: (start, end) => {
        dateFromInput.value = formatDateDisplay(start);
        dateToInput.value = formatDateDisplay(end);
        loadSummary().catch((error) => {
          if (!signal.aborted) {
            showMessage("error", error.message || "Gagal memuat data penjualan.", true);
          }
        });
      }
    });

    dateFromInput.addEventListener('click', () => mainPicker.show());
    dateToInput.addEventListener('click', () => mainPicker.show());

    // Detail Modal Picker
    const detailPicker = new DateRangePicker({
      initialStartDate: monthStartDate,
      initialEndDate: todayDate,
      onApply: (start, end) => {
        detailDateFromInput.value = formatDateDisplay(start);
        detailDateToInput.value = formatDateDisplay(end);
        if (state.selectedProduct) {
           loadDetail().catch((error) => {
            if (!signal.aborted) {
              showMessage("error", error.message || "Gagal memuat detail barang.", true);
            }
          });
        }
      }
    });

    detailDateFromInput.addEventListener('click', () => detailPicker.show());
    detailDateToInput.addEventListener('click', () => detailPicker.show());

    // Set Initial Values
    dateFromInput.value = formatDateDisplay(monthStartDate);
    dateToInput.value = formatDateDisplay(todayDate);
    detailDateFromInput.value = formatDateDisplay(monthStartDate);
    detailDateToInput.value = formatDateDisplay(todayDate);

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function formatCurrency(value) {
      return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
    }

    function formatQty(value) {
      return Number(value || 0).toLocaleString("id-ID", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      });
    }

    function formatDateTime(value) {
      const normalized = String(value ?? "").replace(" ", "T");
      const parsedDate = new Date(normalized);
      if (Number.isNaN(parsedDate.getTime())) return String(value ?? "-");
      return parsedDate.toLocaleString("id-ID");
    }

    function showMessage(type, text, sticky = false) {
      messageEl.textContent = text;
      messageEl.className = `products-message active ${type}`;

      if (state.feedbackTimerId) {
        clearTimeout(state.feedbackTimerId);
        state.feedbackTimerId = null;
      }

      if (sticky) return;

      state.feedbackTimerId = setTimeout(() => {
        messageEl.className = "products-message";
        messageEl.textContent = "";
      }, 2800);
    }

    function clearMessage() {
      if (state.feedbackTimerId) {
        clearTimeout(state.feedbackTimerId);
        state.feedbackTimerId = null;
      }

      messageEl.className = "products-message";
      messageEl.textContent = "";
    }

    function isValidDateRange(startDate, endDate, sourceLabel) {
      if (!startDate || !endDate) {
        showMessage("error", `${sourceLabel}: rentang tanggal wajib diisi.`, true);
        return false;
      }

      if (startDate > endDate) {
        showMessage(
          "error",
          `${sourceLabel}: tanggal mulai tidak boleh lebih besar dari tanggal akhir.`,
          true,
        );
        return false;
      }

      return true;
    }

    function normalizeSummaryRow(row) {
      return {
        product_id: String(row?.product_id ?? ""),
        product_code: String(row?.product_code ?? "-"),
        product_name: String(row?.product_name ?? "-"),
        category_name: String(row?.category_name ?? "-"),
        total_qty: Number(row?.total_qty || 0),
        total_revenue: Number(row?.total_revenue || 0),
        total_profit: Number(row?.total_profit || 0),
      };
    }

    function normalizeDetailRow(row) {
      return {
        created_at: String(row?.created_at ?? ""),
        quantity: Number(row?.quantity || 0),
        subtotal: Number(row?.subtotal || 0),
        profit: Number(row?.profit || 0),
      };
    }

    function getFilteredRows() {
      const keyword = state.keyword.trim().toLowerCase();
      if (!keyword) return state.rows;

      return state.rows.filter((row) => {
        const searchable = [
          row.product_code,
          row.product_name,
          row.category_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchable.includes(keyword);
      });
    }

    function renderSummaryMeta(rows) {
      countEl.textContent = `${rows.length} / ${state.rows.length} barang`;

      const totals = rows.reduce(
        (accumulator, row) => {
          accumulator.qty += Number(row.total_qty || 0);
          accumulator.revenue += Number(row.total_revenue || 0);
          accumulator.profit += Number(row.total_profit || 0);
          return accumulator;
        },
        { qty: 0, revenue: 0, profit: 0 },
      );

      const msgQty = document.getElementById("sales-meta-qty");
      const msgRev = document.getElementById("sales-meta-revenue");
      const msgProf = document.getElementById("sales-meta-profit");
      
      if(msgQty) msgQty.textContent = formatQty(totals.qty);
      if(msgRev) msgRev.textContent = formatCurrency(totals.revenue);
      if(msgProf) msgProf.textContent = formatCurrency(totals.profit);
      
      totalsEl.textContent = `Qty ${formatQty(totals.qty)} | Pendapatan ${formatCurrency(totals.revenue)} | Keuntungan ${formatCurrency(totals.profit)}`;
    }

    function renderSummaryTable() {
      const rows = getFilteredRows();
      renderSummaryMeta(rows);

      summaryBody.innerHTML = "";

      if (state.isLoadingSummary) {
        summaryBody.innerHTML = `
          <tr>
            <td colspan="6" class="py-8 text-center text-slate-500 font-medium text-sm">Memuat rekap penjualan...</td>
          </tr>
        `;
        syncControls();
        return;
      }

      if (!rows.length) {
        summaryBody.innerHTML = `
          <tr>
            <td colspan="6" class="py-8 text-center text-slate-500 font-medium text-sm">Tidak ada data penjualan.</td>
          </tr>
        `;
        syncControls();
        return;
      }

      rows.forEach((row) => {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50/50 transition-colors group cursor-pointer";
        tr.innerHTML = `
          <td class="py-3 px-4 border-b border-slate-100 text-sm font-medium text-slate-700">${escapeHtml(row.product_code)}</td>
          <td class="py-3 px-4 border-b border-slate-100">
            <div class="text-sm font-semibold text-slate-800">${escapeHtml(row.product_name)}</div>
            <div class="text-xs text-slate-500">${escapeHtml(row.category_name || "-")}</div>
          </td>
          <td class="py-3 px-4 border-b border-slate-100 text-sm font-semibold text-slate-700 text-right">${escapeHtml(formatQty(row.total_qty))}</td>
          <td class="py-3 px-4 border-b border-slate-100 text-sm font-semibold text-emerald-600 text-right">${escapeHtml(formatCurrency(row.total_revenue))}</td>
          <td class="py-3 px-4 border-b border-slate-100 text-sm font-bold text-blue-600 text-right">${escapeHtml(formatCurrency(row.total_profit))}</td>
          <td class="py-3 px-4 border-b border-slate-100 text-center">
            <button
              type="button"
              class="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
              data-action="detail"
              data-product-id="${escapeHtml(row.product_id)}"
            >
              Detail
            </button>
          </td>
        `;
        summaryBody.appendChild(tr);
      });

      syncControls();
    }

    function renderDetailTable() {
      detailBody.innerHTML = "";

      if (!state.selectedProduct) {
        detailBody.innerHTML = `
          <tr>
            <td colspan="4" class="py-6 text-center text-slate-500 font-medium text-sm">Pilih barang untuk melihat detail.</td>
          </tr>
        `;
        syncControls();
        return;
      }

      detailNameEl.textContent = state.selectedProduct.product_name || "-";
      detailCodeEl.textContent = state.selectedProduct.product_code || "-";

      if (state.isLoadingDetail) {
        detailBody.innerHTML = `
          <tr>
            <td colspan="4" class="py-6 text-center text-slate-500 font-medium text-sm">Memuat detail transaksi...</td>
          </tr>
        `;
        syncControls();
        return;
      }

      if (!state.detailRows.length) {
        detailBody.innerHTML = `
          <tr>
            <td colspan="4" class="py-6 text-center text-slate-500 font-medium text-sm">Tidak ada data detail pada rentang ini.</td>
          </tr>
        `;
        syncControls();
        return;
      }

      state.detailRows.forEach((row) => {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50/50 transition-colors";
        tr.innerHTML = `
          <td class="py-3 px-4 text-sm font-medium text-slate-700 whitespace-nowrap">${escapeHtml(formatDateTime(row.created_at))}</td>
          <td class="py-3 px-4 text-sm text-slate-600 font-semibold text-right">${escapeHtml(formatQty(row.quantity))}</td>
          <td class="py-3 px-4 text-sm text-emerald-600 font-semibold text-right">${escapeHtml(formatCurrency(row.subtotal))}</td>
          <td class="py-3 px-4 text-sm text-blue-600 font-bold text-right">${escapeHtml(formatCurrency(row.profit))}</td>
        `;
        detailBody.appendChild(tr);
      });

      syncControls();
    }

    function syncControls() {
      searchInput.disabled = state.isLoadingSummary;

      summaryBody.querySelectorAll("button[data-action='detail']").forEach((button) => {
        button.disabled = state.isLoadingSummary || state.isLoadingDetail;
      });

      const detailInputsDisabled = !state.selectedProduct || state.isLoadingDetail;
      detailDateFromInput.disabled = detailInputsDisabled;
      detailDateToInput.disabled = detailInputsDisabled;
    }

    async function loadSummary() {
      const startDate = parseDateToISO(dateFromInput.value);
      const endDate = parseDateToISO(dateToInput.value);

      if (!isValidDateRange(startDate, endDate, "Filter utama")) {
        renderSummaryTable();
        return;
      }

      const requestVersion = ++state.summaryRequestVersion;
      state.isLoadingSummary = true;
      renderSummaryTable();

      try {
        const rows = await window.api.getSalesSummary({ startDate, endDate });
        if (signal.aborted || requestVersion !== state.summaryRequestVersion) return;

        state.rows = Array.isArray(rows) ? rows.map(normalizeSummaryRow) : [];
        clearMessage();
      } catch (error) {
        if (!signal.aborted) {
          state.rows = [];
          showMessage("error", error.message || "Gagal memuat data penjualan.", true);
        }
      } finally {
        if (!signal.aborted && requestVersion === state.summaryRequestVersion) {
          state.isLoadingSummary = false;
          renderSummaryTable();
        }
      }
    }

    async function loadDetail() {
      if (!state.selectedProduct) return;

      const startDate = parseDateToISO(detailDateFromInput.value);
      const endDate = parseDateToISO(detailDateToInput.value);

      if (!isValidDateRange(startDate, endDate, "Filter detail")) {
        renderDetailTable();
        return;
      }

      const requestVersion = ++state.detailRequestVersion;
      state.isLoadingDetail = true;
      renderDetailTable();

      try {
        const result = await window.api.getSalesProductDetail({
          productId: state.selectedProduct.product_id,
          startDate,
          endDate,
        });
        if (signal.aborted || requestVersion !== state.detailRequestVersion) return;

        const product = result?.product ?? {};
        state.selectedProduct = {
          ...state.selectedProduct,
          product_name:
            String(product.product_name ?? state.selectedProduct.product_name) ||
            "-",
          product_code:
            String(product.product_code ?? state.selectedProduct.product_code) ||
            "-",
        };

        const items = Array.isArray(result?.items) ? result.items : [];
        state.detailRows = items.map(normalizeDetailRow);
        clearMessage();
      } catch (error) {
        if (!signal.aborted) {
          state.detailRows = [];
          showMessage("error", error.message || "Gagal memuat detail barang.", true);
        }
      } finally {
        if (!signal.aborted && requestVersion === state.detailRequestVersion) {
          state.isLoadingDetail = false;
          renderDetailTable();
        }
      }
    }

    function openDetailModal(productId) {
      const row = state.rows.find(
        (item) => String(item.product_id) === String(productId),
      );

      if (!row) return;

      state.selectedProduct = { ...row };
      state.detailRows = [];
      // Sync detail picker with main picker state
      detailPicker.setDateRange(mainPicker.startDate, mainPicker.endDate);
      
      // Update external inputs to match
      detailDateFromInput.value = dateFromInput.value;
      detailDateToInput.value = dateToInput.value;

      detailModal.classList.add("active");
      detailModal.setAttribute("aria-hidden", "false");
      renderDetailTable();

      loadDetail().catch((error) => {
        if (!signal.aborted) {
          showMessage("error", error.message || "Gagal memuat detail barang.", true);
        }
      });
    }

    function closeDetailModal() {
      state.selectedProduct = null;
      state.detailRows = [];
      state.isLoadingDetail = false;
      state.detailRequestVersion += 1;

      detailModal.classList.remove("active");
      detailModal.setAttribute("aria-hidden", "true");
      renderDetailTable();
    }

    /* Old event listeners removed */

    searchInput.addEventListener(
      "input",
      () => {
        state.keyword = searchInput.value || "";
        renderSummaryTable();
      },
      { signal },
    );

    summaryBody.addEventListener(
      "click",
      (event) => {
        const detailButton = event.target.closest("button[data-action='detail']");
        if (!detailButton) return;
        openDetailModal(detailButton.dataset.productId);
      },
      { signal },
    );

    detailCloseIcon.addEventListener(
      "click",
      () => {
        closeDetailModal();
      },
      { signal },
    );

    detailCloseButton.addEventListener(
      "click",
      () => {
        closeDetailModal();
      },
      { signal },
    );

    detailModal.addEventListener(
      "click",
      (event) => {
        if (event.target === detailModal) {
          closeDetailModal();
        }
      },
      { signal },
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && detailModal.classList.contains("active")) {
          closeDetailModal();
        }
      },
      { signal },
    );

    loadSummary().catch((error) => {
      if (!signal.aborted) {
        showMessage("error", error.message || "Gagal memuat data penjualan.", true);
      }
    });

    return () => {
      eventController.abort();
      clearMessage();
      detailModal.classList.remove("active");
      detailModal.setAttribute("aria-hidden", "true");
    };
  }

  window.pageModules = window.pageModules || {};
  window.pageModules.sales = { init: initSales };
})();
