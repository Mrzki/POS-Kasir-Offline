(() => {
  function initStock() {
    const productsBody = document.getElementById("stock-products-body");
    const searchInput = document.getElementById("stock-search");
    const countEl = document.getElementById("stock-count");
    const messageEl = document.getElementById("stock-message");
    
    // MODAL ELEMENTS (Replaces Sidebar)
    const stockModal = document.getElementById("stock-modal");
    const modalTitle = document.getElementById("stock-modal-title");
    const modalClose = document.getElementById("stock-modal-close");
    const modalContent = document.getElementById("stock-modal-content");

    if (
      !productsBody ||
      !searchInput ||
      !countEl ||
      !messageEl ||
      !stockModal ||
      !modalTitle ||
      !modalClose ||
      !modalContent
    ) {
      console.error("[Stock] elemen wajib tidak ditemukan.");
      return () => {};
    }

    const eventController = new AbortController();
    const { signal } = eventController;

    const state = {
      products: [],
      keyword: "",
      sidebarMode: null,
      activeProductId: null,
      activeDetail: null,
      stockAdjustMode: "add",
      isBusy: false,
      feedbackTimerId: null,
      detailRequestVersion: 0,
    };

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function formatQty(value) {
      return Number(value || 0).toLocaleString("id-ID", {
        maximumFractionDigits: 3,
      });
    }

    function formatRupiah(value) {
      return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
    }

    function formatDateTime(value) {
      if (!value) return "-";
      const parsed = new Date(String(value).replace(" ", "T"));
      if (Number.isNaN(parsed.getTime())) return String(value);
      return parsed.toLocaleString("id-ID");
    }

    function getTodayDate() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    function formatDate(value) {
      if (!value) return "-";
      const trimmed = String(value).trim();
      if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed;
      const parsed = new Date(trimmed.slice(0, 10) + "T00:00:00");
      if (Number.isNaN(parsed.getTime())) return trimmed;
      return parsed.toLocaleDateString("id-ID", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }

    function showMessage(type, text, sticky = false) {
      messageEl.textContent = text;
      // products-message has the fixed top notification styling in input.css
      messageEl.className = `products-message active ${type}`;

      if (state.feedbackTimerId) {
        clearTimeout(state.feedbackTimerId);
        state.feedbackTimerId = null;
      }

      if (sticky) return;

      state.feedbackTimerId = setTimeout(() => {
        messageEl.className = "hidden";
        messageEl.textContent = "";
      }, 2800);
    }

    function parsePositiveNumber(rawValue) {
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed) || parsed <= 0) return null;
      return parsed;
    }

    function parsePositiveInteger(rawValue) {
      const parsed = Number(rawValue);
      if (!Number.isInteger(parsed) || parsed <= 0) return null;
      return parsed;
    }

    function getActiveProductFromList() {
      if (!state.activeProductId) return null;
      return (
        state.products.find(
          (row) => String(row.product_id) === String(state.activeProductId),
        ) || null
      );
    }

    function getFilteredProducts() {
      const keyword = state.keyword.trim().toLowerCase();
      if (!keyword) return state.products;

      return state.products.filter((row) => {
        const searchable = [
          row.name,
          row.category_name,
          row.unit,
          row.barcode,
          row.product_id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchable.includes(keyword);
      });
    }

    function renderProductsTable() {
      const rows = getFilteredProducts();
      countEl.textContent = `${rows.length} / ${state.products.length} produk`;
      productsBody.innerHTML = "";

      if (!rows.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="5" class="px-6 py-8 text-center text-slate-400 italic">Produk tidak ditemukan.</td>`;
        productsBody.appendChild(tr);
        return;
      }

      rows.forEach((row) => {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0";
        const barcode = row.barcode ? escapeHtml(row.barcode) : "-";
        const isDisabled = state.isBusy ? "disabled" : "";

        tr.innerHTML = `
          <td class="px-6 py-4">
            <div class="font-bold text-slate-800 text-sm">${escapeHtml(row.name)}</div>
            <div class="text-xs text-slate-500 font-mono mt-0.5">Barcode: ${barcode}</div>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600"><span class="px-2 py-1 bg-slate-100 rounded-md text-xs font-semibold">${escapeHtml(row.category_name || "-")}</span></td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600 uppercase tracking-widest text-xs font-bold">${escapeHtml(row.unit || "-")}</td>
          <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-slate-800">${formatQty(row.total_stock)}</td>
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="flex items-center justify-center gap-2">
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center justify-center font-bold text-xs"
                data-action="edit"
                data-product-id="${escapeHtml(row.product_id)}"
                ${isDisabled}
              >
                Ubah Stok
              </button>
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors flex items-center justify-center font-bold text-xs border border-transparent hover:border-slate-200"
                data-action="detail"
                data-product-id="${escapeHtml(row.product_id)}"
                ${isDisabled}
              >
                Detail
              </button>
            </div>
          </td>
        `;

        productsBody.appendChild(tr);
      });
    }

    function renderModalLoading() {
      modalContent.innerHTML = `
        <div class="p-8 text-center text-slate-500 font-medium">
          Memuat data stok produk...
        </div>
      `;
    }

    function renderModalError(text) {
      modalContent.innerHTML = `
        <div class="p-6 bg-red-50 border border-red-200 rounded-xl text-red-600 font-medium text-center">
          ${escapeHtml(text)}
        </div>
      `;
    }

    function buildStockInfoHtml(detail, includeCurrentStock) {
      const productRow = getActiveProductFromList();
      const categoryName = detail?.categoryName || productRow?.category_name || "-";
      const barcode = detail?.barcode || productRow?.barcode || "-";
      const fields = [
        {
          label: "Nama Produk",
          value: detail?.productName || productRow?.name || "-",
        },
        {
          label: "Kategori",
          value: categoryName,
        },
        {
          label: "Kode / Barcode",
          value: barcode,
        },
      ];

      if (includeCurrentStock) {
        const unit = detail?.unit || productRow?.unit || "";
        fields.push({
          label: "Sisa Stok Saat Ini",
          value: `${formatQty(detail?.totalStock)} ${unit}`.trim(),
        });
      }

      return `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
          ${fields
            .map(
              (item) => `
                <div class="flex flex-col gap-1">
                  <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">${escapeHtml(item.label)}</div>
                  <div class="text-sm font-bold text-slate-800 break-words">${escapeHtml(item.value || "-")}</div>
                </div>
              `,
            )
            .join("")}
        </div>
      `;
    }

    function renderEditModal(detail) {
      modalContent.innerHTML = `
        ${buildStockInfoHtml(detail, true)}

        <!-- MODE SWITCH -->
        <div class="flex p-1 bg-slate-100 rounded-xl">
          <button type="button" class="flex-1 py-2 text-sm font-bold rounded-lg transition-all focus:outline-none" data-stock-mode="add">
            Tambah Stok
          </button>
          <button type="button" class="flex-1 py-2 text-sm font-bold rounded-lg transition-all focus:outline-none" data-stock-mode="remove">
            Kurangi Stok
          </button>
        </div>

        <section id="stock-panel-add" class="flex flex-col gap-4">
          <div class="p-5 border border-slate-200 rounded-xl flex flex-col gap-4 bg-white shadow-sm">
            <div>
              <h4 class="font-bold text-slate-800">Tambah Stok</h4>
              <p class="text-xs font-medium text-slate-500 mt-1">Data masuk akan disimpan sebagai batch baru FIFO.</p>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="stock-input-add-date" class="text-xs font-bold text-slate-500 uppercase tracking-wider">Tanggal Stok Masuk</label>
              <input
                id="stock-input-add-date"
                type="date"
                value="${getTodayDate()}"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="stock-input-add-qty" class="text-xs font-bold text-slate-500 uppercase tracking-wider">Jumlah stok masuk</label>
              <input
                id="stock-input-add-qty"
                type="number"
                step="any"
                min="0.001"
                placeholder="Contoh: 10"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all placeholder:font-medium placeholder:text-slate-400"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="stock-input-add-cost" class="text-xs font-bold text-slate-500 uppercase tracking-wider">Harga modal / Harga dasar</label>
              <input
                id="stock-input-add-cost"
                type="number"
                step="1"
                min="1"
                placeholder="Contoh: 12000"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all placeholder:font-medium placeholder:text-slate-400"
              />
            </div>
            <button type="button" class="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ring-offset-2 mt-2" data-stock-submit="add">
              Tambah Stok
            </button>
          </div>
        </section>

        <section id="stock-panel-remove" class="flex flex-col gap-4">
          <div class="p-5 border border-red-100 rounded-xl flex flex-col gap-4 bg-red-50/30">
            <div>
              <h4 class="font-bold text-red-800">Kurangi Stok</h4>
              <p class="text-xs font-medium text-red-500/80 mt-1">Pengurangan stok akan diproses FIFO dari batch terlama.</p>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="stock-input-remove-qty" class="text-xs font-bold text-red-500 uppercase tracking-wider">Jumlah stok keluar</label>
              <input
                id="stock-input-remove-qty"
                type="number"
                step="any"
                min="0.001"
                placeholder="Contoh: 5"
                class="w-full px-4 py-2.5 bg-white border border-red-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 transition-all placeholder:font-medium placeholder:text-red-300"
              />
            </div>
            <button
              type="button"
              class="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 ring-offset-2 mt-2"
              data-stock-submit="remove"
            >
              Kurangi Stok
            </button>
          </div>
        </section>
      `;

      applyStockAdjustMode(state.stockAdjustMode);
    }

    function renderDetailModal(detail) {
      const rows = Array.isArray(detail?.batches) ? detail.batches : [];
      const unit = detail?.unit || "-";

      modalContent.innerHTML = `
        ${buildStockInfoHtml(detail, false)}

        <div class="border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
          <table class="w-full text-left border-collapse min-w-[500px]">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>
                <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Tanggal Masuk</th>
                <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap text-right">Qty Awal</th>
                <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap text-right">Qty Sisa</th>
                <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap text-center">Satuan</th>
                <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap text-right">Harga Modal</th>
                <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap text-center w-24">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${
                rows.length
                  ? rows
                      .map(
                        (batch) => `
                          <tr data-batch-id="${escapeHtml(batch.id)}" class="hover:bg-slate-50 transition-colors">
                            <td class="px-4 py-3 whitespace-nowrap text-sm font-semibold text-slate-700">${escapeHtml(formatDate(batch.stock_date))}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600 text-right font-medium">${formatQty(batch.quantity_initial)}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-800 text-right font-bold">${formatQty(batch.quantity_remaining)}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-xs text-slate-500 uppercase tracking-wider font-bold text-center">${escapeHtml(unit)}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-700 text-right font-semibold">${formatRupiah(batch.cost_price)}</td>
                            <td class="px-4 py-3 whitespace-nowrap">
                              <div class="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  class="w-8 h-8 flex items-center justify-center rounded-lg text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors focus:outline-none"
                                  data-batch-action="edit"
                                  data-batch-id="${escapeHtml(batch.id)}"
                                  title="Edit batch"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                                </button>
                                <button
                                  type="button"
                                  class="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none"
                                  data-batch-action="delete"
                                  data-batch-id="${escapeHtml(batch.id)}"
                                  title="Hapus batch"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        `,
                      )
                      .join("")
                  : `
                    <tr>
                      <td colspan="6" class="px-6 py-8 text-center text-slate-400 italic">Belum ada sisa batch stok.</td>
                    </tr>
                  `
              }
            </tbody>
          </table>
        </div>

        <div id="batch-edit-panel" class="hidden"></div>
        <div id="batch-delete-confirm" class="hidden"></div>
      `;
    }

    function getBatchById(batchId) {
      if (!state.activeDetail?.batches) return null;
      return state.activeDetail.batches.find((b) => b.id === batchId) || null;
    }

    function showBatchEditForm(batchId) {
      const batch = getBatchById(batchId);
      if (!batch) return;

      const panel = modalContent.querySelector("#batch-edit-panel");
      const confirmPanel = modalContent.querySelector("#batch-delete-confirm");
      if (!panel) return;
      if (confirmPanel) confirmPanel.classList.add("hidden");

      const usedQty = Number(batch.quantity_initial) - Number(batch.quantity_remaining);

      panel.innerHTML = `
        <div class="p-5 border border-blue-200 bg-blue-50/50 rounded-xl flex flex-col gap-4 mt-2 shadow-sm">
          <div>
            <h4 class="font-bold text-slate-800">Edit Batch Stok</h4>
            <p class="text-xs font-medium text-slate-500 mt-1">
              ${usedQty > 0
                ? `<strong class="text-amber-600">${formatQty(usedQty)}</strong> unit sudah terpakai. Jumlah stok awal tidak boleh kurang.`
                : "Batch ini belum ada yang terpakai."
              }
            </p>
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="batch-edit-date" class="text-xs font-bold text-slate-500 uppercase tracking-wider">Tanggal Stok Masuk</label>
            <input
              id="batch-edit-date"
              type="date"
              value="${batch.stock_date || getTodayDate()}"
              class="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="batch-edit-qty" class="text-xs font-bold text-slate-500 uppercase tracking-wider">Jumlah Stok Awal</label>
            <input
              id="batch-edit-qty"
              type="number"
              step="any"
              min="${usedQty > 0 ? usedQty : 0.001}"
              value="${batch.quantity_initial}"
              class="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="batch-edit-cost" class="text-xs font-bold text-slate-500 uppercase tracking-wider">Harga Modal</label>
            <input
              id="batch-edit-cost"
              type="number"
              step="1"
              min="1"
              value="${batch.cost_price}"
              class="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </div>
          <div class="grid grid-cols-2 gap-3 mt-2">
            <button
              type="button"
              class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ring-offset-2"
              data-batch-submit="save"
              data-batch-id="${escapeHtml(batchId)}"
            >Simpan</button>
            <button
              type="button"
              class="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200"
              data-batch-submit="cancel"
            >Batal</button>
          </div>
        </div>
      `;

      panel.classList.remove("hidden");
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function hideBatchEditForm() {
      const panel = modalContent.querySelector("#batch-edit-panel");
      if (panel) {
        panel.classList.add("hidden");
        panel.innerHTML = "";
      }
    }

    function showBatchDeleteConfirm(batchId) {
      const batch = getBatchById(batchId);
      if (!batch) return;

      const panel = sidebarContent.querySelector("#batch-delete-confirm");
      const editPanel = sidebarContent.querySelector("#batch-edit-panel");
      if (!panel) return;
      if (editPanel) editPanel.hidden = true;

      const usedQty = Number(batch.quantity_initial) - Number(batch.quantity_remaining);

      if (usedQty > 0) {
        showMessage(
          "error",
          `Batch tidak bisa dihapus, ${formatQty(usedQty)} unit sudah terpakai.`,
          true,
        );
        return;
      }

      panel.innerHTML = `
        <div class="batch-confirm-card">
          <p class="batch-confirm-text">
            Yakin ingin menghapus batch ini?
          </p>
          <p class="stock-hint">
            Tanggal: <strong>${escapeHtml(formatDate(batch.stock_date))}</strong>,
            Qty: <strong>${formatQty(batch.quantity_initial)}</strong>,
            Harga: <strong>${formatRupiah(batch.cost_price)}</strong>
          </p>
          <div class="batch-edit-actions">
            <button
              type="button"
              class="stock-submit stock-submit-remove"
              data-batch-confirm="yes"
              data-batch-id="${escapeHtml(batchId)}"
            >Ya, Hapus</button>
            <button
              type="button"
              class="stock-btn stock-btn-detail"
              data-batch-confirm="no"
            >Batal</button>
          </div>
        </div>
      `;

      panel.hidden = false;
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function hideBatchDeleteConfirm() {
      const panel = sidebarContent.querySelector("#batch-delete-confirm");
      if (panel) {
        panel.hidden = true;
        panel.innerHTML = "";
      }
    }

    async function submitEditBatch(batchId) {
      const dateInput = modalContent.querySelector("#batch-edit-date");
      const qtyInput = modalContent.querySelector("#batch-edit-qty");
      const costInput = modalContent.querySelector("#batch-edit-cost");

      if (!qtyInput || !costInput) return;

      const qty = parsePositiveNumber(qtyInput.value);
      const costPrice = parsePositiveInteger(costInput.value);
      const stockDate = dateInput?.value || getTodayDate();

      if (!qty) {
        showMessage("error", "Jumlah stok awal harus lebih besar dari 0.", true);
        return;
      }

      if (!costPrice) {
        showMessage("error", "Harga modal harus bilangan bulat positif.", true);
        return;
      }

      setBusy(true);

      try {
        await window.api.updateStockBatch(batchId, {
          quantityInitial: qty,
          costPrice,
          stockDate,
        });
        if (signal.aborted) return;

        showMessage("success", "Batch stok berhasil diperbarui.");
        await loadProducts();
        await refreshSidebarDetail();
      } catch (error) {
        if (!signal.aborted) {
          showMessage("error", error.message, true);
        }
      } finally {
        if (!signal.aborted) {
          setBusy(false);
        }
      }
    }

    async function submitDeleteBatch(batchId) {
      setBusy(true);

      try {
        await window.api.deleteStockBatch(batchId);
        if (signal.aborted) return;

        showMessage("success", "Batch stok berhasil dihapus.");
        await loadProducts();
        await refreshSidebarDetail();
      } catch (error) {
        if (!signal.aborted) {
          showMessage("error", error.message, true);
        }
      } finally {
        if (!signal.aborted) {
          setBusy(false);
        }
      }
    }

    function applyStockAdjustMode(mode) {
      if (state.sidebarMode !== "edit") return;

      state.stockAdjustMode = mode === "remove" ? "remove" : "add";

      const addButton = modalContent.querySelector('[data-stock-mode="add"]');
      const removeButton = modalContent.querySelector('[data-stock-mode="remove"]');
      const addPanel = modalContent.querySelector("#stock-panel-add");
      const removePanel = modalContent.querySelector("#stock-panel-remove");

      if (!addButton || !removeButton || !addPanel || !removePanel) return;

      const isAddMode = state.stockAdjustMode === "add";
      
      // Update Button Class
      if (isAddMode) {
        addButton.className = "flex-1 py-2 text-sm font-bold rounded-lg transition-all focus:outline-none bg-emerald-600 text-white shadow-sm";
        removeButton.className = "flex-1 py-2 text-sm font-bold rounded-lg transition-all focus:outline-none text-slate-500 hover:text-slate-800";
      } else {
        addButton.className = "flex-1 py-2 text-sm font-bold rounded-lg transition-all focus:outline-none text-slate-500 hover:text-slate-800";
        removeButton.className = "flex-1 py-2 text-sm font-bold rounded-lg transition-all focus:outline-none bg-red-600 text-white shadow-sm";
      }

      // Hide panels
      if (isAddMode) {
        addPanel.classList.remove("hidden");
        removePanel.classList.add("hidden");
      } else {
        removePanel.classList.remove("hidden");
        addPanel.classList.add("hidden");
      }
    }

    function setSidebarVisible(isOpen) {
      if (isOpen) {
        stockModal.classList.add("active");
        setTimeout(() => {
          modalClose.focus();
        }, 50);
      } else {
        stockModal.classList.remove("active");
      }
    }

    function closeSidebar() {
      state.sidebarMode = null;
      state.activeProductId = null;
      state.activeDetail = null;
      state.stockAdjustMode = "add";
      state.detailRequestVersion += 1;

      setSidebarVisible(false);
      modalContent.innerHTML = "";
      modalTitle.textContent = "Loading...";
    }

    function setBusy(isBusy) {
      state.isBusy = isBusy;
      searchInput.disabled = isBusy;

      productsBody.querySelectorAll("button[data-action]").forEach((button) => {
        button.disabled = isBusy;
      });

      if (state.sidebarMode === "edit") {
        modalContent
          .querySelectorAll("input, button[data-stock-mode], button[data-stock-submit]")
          .forEach((element) => {
            element.disabled = isBusy;
          });
      }
    }

    async function loadProducts() {
      const rows = await window.api.getAllStock();
      if (signal.aborted) return;

      state.products = Array.isArray(rows) ? rows : [];
      renderProductsTable();

      if (
        state.sidebarMode &&
        state.activeProductId &&
        !state.products.some(
          (row) => String(row.product_id) === String(state.activeProductId),
        )
      ) {
        closeSidebar();
        showMessage("info", "Produk tidak ditemukan pada daftar terbaru.", true);
      }

      setBusy(state.isBusy);
    }

    async function refreshSidebarDetail() {
      if (!state.sidebarMode || !state.activeProductId) return;

      const requestVersion = ++state.detailRequestVersion;

      try {
        const detail = await window.api.getStock(state.activeProductId);
        if (signal.aborted || requestVersion !== state.detailRequestVersion) return;

        state.activeDetail = detail;

        if (state.sidebarMode === "edit") {
          renderEditModal(detail);
        } else {
          renderDetailModal(detail);
        }

        setBusy(state.isBusy);
      } catch (error) {
        if (!signal.aborted) {
          renderModalError(error.message);
          showMessage("error", error.message, true);
        }
      }
    }

    async function openSidebar(mode, productId) {
      state.sidebarMode = mode === "detail" ? "detail" : "edit";
      state.activeProductId = productId;
      state.activeDetail = null;
      state.stockAdjustMode = "add";

      modalTitle.textContent =
        state.sidebarMode === "edit" ? "Ubah Stok" : "Detail Sisa Stok";

      setSidebarVisible(true);
      renderModalLoading();
      await refreshSidebarDetail();
    }

    async function submitAddStock() {
      if (!state.activeProductId) return;

      const dateInput = modalContent.querySelector("#stock-input-add-date");
      const qtyInput = modalContent.querySelector("#stock-input-add-qty");
      const costInput = modalContent.querySelector("#stock-input-add-cost");

      if (!qtyInput || !costInput) return;

      const qty = parsePositiveNumber(qtyInput.value);
      const costPrice = parsePositiveInteger(costInput.value);
      const stockDate = dateInput?.value || getTodayDate();

      if (!qty) {
        showMessage("error", "Jumlah stok masuk harus lebih besar dari 0.", true);
        return;
      }

      if (!costPrice) {
        showMessage("error", "Harga modal harus bilangan bulat positif.", true);
        return;
      }

      setBusy(true);

      try {
        await window.api.addStock({
          productId: state.activeProductId,
          qty,
          costPrice,
          stockDate,
        });
        if (signal.aborted) return;

        showMessage("success", "Stok berhasil ditambahkan.");
        await loadProducts();
        await refreshSidebarDetail();
      } catch (error) {
        if (!signal.aborted) {
          showMessage("error", error.message, true);
        }
      } finally {
        if (!signal.aborted) {
          setBusy(false);
        }
      }
    }

    async function submitRemoveStock() {
      if (!state.activeProductId) return;

      const qtyInput = modalContent.querySelector("#stock-input-remove-qty");
      if (!qtyInput) return;

      const qty = parsePositiveNumber(qtyInput.value);

      if (!qty) {
        showMessage("error", "Jumlah stok keluar harus lebih besar dari 0.", true);
        return;
      }

      setBusy(true);

      try {
        await window.api.removeStock(state.activeProductId, qty);
        if (signal.aborted) return;

        showMessage("success", "Stok keluar berhasil diproses FIFO.");
        await loadProducts();
        await refreshSidebarDetail();
      } catch (error) {
        if (!signal.aborted) {
          showMessage("error", error.message, true);
        }
      } finally {
        if (!signal.aborted) {
          setBusy(false);
        }
      }
    }

    searchInput.addEventListener(
      "input",
      () => {
        state.keyword = searchInput.value || "";
        renderProductsTable();
        setBusy(state.isBusy);
      },
      { signal },
    );

    productsBody.addEventListener(
      "click",
      (event) => {
        const actionButton = event.target.closest("button[data-action]");
        if (!actionButton || state.isBusy) return;

        const action = actionButton.dataset.action;
        const productId = actionButton.dataset.productId;
        if (!productId) return;

        openSidebar(action, productId).catch((error) => {
          if (!signal.aborted) {
            showMessage("error", error.message, true);
          }
        });
      },
      { signal },
    );

    modalContent.addEventListener(
      "click",
      (event) => {
        const modeButton = event.target.closest("button[data-stock-mode]");
        if (modeButton && !state.isBusy) {
          applyStockAdjustMode(modeButton.dataset.stockMode);
          return;
        }

        const submitButton = event.target.closest("button[data-stock-submit]");
        if (submitButton && !state.isBusy) {
          const submitMode = submitButton.dataset.stockSubmit;

          if (submitMode === "add") {
            submitAddStock().catch((error) => {
              if (!signal.aborted) {
                showMessage("error", error.message, true);
              }
            });
            return;
          }

          if (submitMode === "remove") {
            submitRemoveStock().catch((error) => {
              if (!signal.aborted) {
                showMessage("error", error.message, true);
              }
            });
          }
          return;
        }

        // Batch action buttons (edit / delete)
        const batchActionBtn = event.target.closest("button[data-batch-action]");
        if (batchActionBtn && !state.isBusy) {
          const action = batchActionBtn.dataset.batchAction;
          const batchId = batchActionBtn.dataset.batchId;
          if (!batchId) return;

          if (action === "edit") {
            showBatchEditForm(batchId);
          } else if (action === "delete") {
            showBatchDeleteConfirm(batchId);
          }
          return;
        }

        // Batch edit panel buttons (save / cancel)
        const batchSubmitBtn = event.target.closest("button[data-batch-submit]");
        if (batchSubmitBtn && !state.isBusy) {
          const submitAction = batchSubmitBtn.dataset.batchSubmit;
          if (submitAction === "cancel") {
            hideBatchEditForm();
            return;
          }
          if (submitAction === "save") {
            const batchId = batchSubmitBtn.dataset.batchId;
            if (batchId) {
              submitEditBatch(batchId).catch((error) => {
                if (!signal.aborted) {
                  showMessage("error", error.message, true);
                }
              });
            }
          }
          return;
        }

        // Batch delete confirm buttons (yes / no)
        const batchConfirmBtn = event.target.closest("button[data-batch-confirm]");
        if (batchConfirmBtn && !state.isBusy) {
          const confirmAction = batchConfirmBtn.dataset.batchConfirm;
          if (confirmAction === "no") {
            hideBatchDeleteConfirm();
            return;
          }
          if (confirmAction === "yes") {
            const batchId = batchConfirmBtn.dataset.batchId;
            if (batchId) {
              submitDeleteBatch(batchId).catch((error) => {
                if (!signal.aborted) {
                  showMessage("error", error.message, true);
                }
              });
            }
          }
        }
      },
      { signal },
    );

    modalClose.addEventListener(
      "click",
      () => {
        closeSidebar();
      },
      { signal },
    );

    stockModal.addEventListener(
      "click",
      (event) => {
        if (event.target === stockModal) {
          closeSidebar();
        }
      },
      { signal },
    );

    // ======= IMPORT STOK MODAL =======
    const stockImportModal = document.getElementById("stock-import-modal");
    const btnOpenStockImport = document.getElementById("btn-open-stock-import");
    const btnCloseStockImport = document.getElementById("close-stock-import-modal");
    const btnDownloadStockTemplate = document.getElementById("btn-download-stock-template");
    const btnImportStockExcel = document.getElementById("btn-import-stock-excel");

    function openStockImportModal() {
      if (stockImportModal) stockImportModal.classList.add("active");
    }

    function closeStockImportModal() {
      if (stockImportModal) stockImportModal.classList.remove("active");
    }

    if (btnOpenStockImport) {
      btnOpenStockImport.addEventListener("click", () => openStockImportModal(), { signal });
    }

    if (btnCloseStockImport) {
      btnCloseStockImport.addEventListener("click", () => closeStockImportModal(), { signal });
    }

    if (stockImportModal) {
      stockImportModal.addEventListener(
        "click",
        (event) => {
          if (event.target === stockImportModal) closeStockImportModal();
        },
        { signal },
      );
    }

    if (btnDownloadStockTemplate) {
      btnDownloadStockTemplate.addEventListener(
        "click",
        async () => {
          btnDownloadStockTemplate.disabled = true;
          try {
            const result = await window.api.downloadStockTemplate();
            if (signal.aborted) return;

            if (result && result.success) {
              showMessage("success", result.message);
            } else if (result) {
              showMessage("error", result.message || "Gagal menyimpan template.");
            }
          } catch (error) {
            if (!signal.aborted) {
              showMessage("error", error.message, true);
            }
          } finally {
            if (!signal.aborted) btnDownloadStockTemplate.disabled = false;
          }
        },
        { signal },
      );
    }

    if (btnImportStockExcel) {
      btnImportStockExcel.addEventListener(
        "click",
        async () => {
          setBusy(true);
          try {
            const result = await window.api.importStock();
            if (signal.aborted) return;

            if (result && result.success) {
              closeStockImportModal();
              showMessage("success", result.message);

              if (result.errors && result.errors.length > 0) {
                console.warn("[Import Stok] Peringatan:", result.errors);
                setTimeout(() => {
                  if (!signal.aborted) {
                    showMessage(
                      "error",
                      `${result.errors.length} baris bermasalah. Cek console untuk detail.`,
                      true,
                    );
                  }
                }, 3000);
              }

              await loadProducts();
            } else if (result) {
              showMessage("error", result.message || "Import dibatalkan.");
            }
          } catch (error) {
            if (!signal.aborted) {
              showMessage("error", error.message, true);
            }
          } finally {
            if (!signal.aborted) setBusy(false);
          }
        },
        { signal },
      );
    }

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape") return;

        if (stockImportModal && stockImportModal.classList.contains("active")) {
          closeStockImportModal();
          return;
        }

        if (state.sidebarMode) {
          closeSidebar();
        }
      },
      { signal },
    );

    loadProducts().catch((error) => {
      if (!signal.aborted) {
        showMessage("error", error.message, true);
      }
    });

    return () => {
      eventController.abort();
      closeSidebar();
      closeStockImportModal();

      if (state.feedbackTimerId) {
        clearTimeout(state.feedbackTimerId);
      }
    };
  }

  window.pageModules = window.pageModules || {};
  window.pageModules.stocks = { init: initStock };
})();
