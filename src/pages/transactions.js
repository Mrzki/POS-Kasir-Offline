(() => {
  function initTransactions() {
    const tbody = document.getElementById("transactions-body");
    const dateStartInput = document.getElementById("transaction-date-start");
    const dateEndInput = document.getElementById("transaction-date-end");
    const btnLoad = document.getElementById("btn-load-transactions");
    const messageEl = document.getElementById("transactions-message");
    const searchInput = document.getElementById("transaction-search");
    const searchCountEl = document.getElementById("transaction-search-count");

    const detailModal = document.getElementById("detail-modal");
    const detailContent = document.getElementById("detail-content");
    const closeDetail = document.getElementById("close-detail");

    const voidModal = document.getElementById("void-modal");
    const voidInfo = document.getElementById("void-info");
    const cancelVoid = document.getElementById("cancel-void");
    const confirmVoid = document.getElementById("confirm-void");

    if (
      !tbody ||
      !dateStartInput ||
      !dateEndInput ||
      !btnLoad ||
      !messageEl ||
      !searchInput ||
      !searchCountEl ||
      !detailModal ||
      !detailContent ||
      !closeDetail ||
      !voidModal ||
      !voidInfo ||
      !cancelVoid ||
      !confirmVoid
    ) {
      console.error("[Transactions] Elemen wajib tidak ditemukan.");
      return () => {};
    }

    const eventController = new AbortController();
    const { signal } = eventController;

    const state = {
      transactions: [],
      keyword: "",
      isLoading: false,
      isVoiding: false,
      selectedTransactionId: null,
      feedbackTimerId: null,
    };

    // Initialize Date Picker
    const today = new Date();
    const picker = new DateRangePicker({
      initialStartDate: today,
      initialEndDate: today,
      onApply: (start, end) => {
        dateStartInput.value = formatDateDisplay(start);
        dateEndInput.value = formatDateDisplay(end);
      }
    });

    dateStartInput.addEventListener('click', () => picker.show());
    dateEndInput.addEventListener('click', () => picker.show());

    // Set initial values
    dateStartInput.value = formatDateDisplay(today);
    dateEndInput.value = formatDateDisplay(today);

    function formatDateDisplay(date) {
      if (!date) return '';
      const d = date.getDate().toString().padStart(2, '0');
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      const y = date.getFullYear();
      return `${d}-${m}-${y}`;
    }

    function parseDateDisplay(str) {
      if (!str) return null;
      const parts = str.split('-');
      if (parts.length !== 3) return null;
      return `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
    }

    function getTodayDate() {
      return new Date().toISOString().slice(0, 10);
    }

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

    function canVoidTransaction(tx) {
      return tx && !tx.is_voided;
    }

    function syncControls() {
      btnLoad.disabled = state.isLoading;
      searchInput.disabled = state.isLoading;
      confirmVoid.disabled = state.isVoiding;
      cancelVoid.disabled = state.isVoiding;
    }

    function getFilteredTransactions() {
      const keyword = state.keyword.trim().toLowerCase();
      if (!keyword) return state.transactions;
      return state.transactions.filter((tx) =>
        String(tx.transaction_number || "").toLowerCase().includes(keyword)
      );
    }

    function renderTransactions() {
      tbody.innerHTML = "";

      if (state.isLoading) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-500 font-medium">Memuat transaksi...</td></tr>`;
        searchCountEl.textContent = "";
        return;
      }

      const filtered = getFilteredTransactions();

      // Show search count
      if (state.keyword.trim()) {
        searchCountEl.textContent = `${filtered.length} / ${state.transactions.length} transaksi`;
      } else {
        searchCountEl.textContent = state.transactions.length
          ? `${state.transactions.length} transaksi`
          : "";
      }

      if (!filtered.length) {
        const msg = state.keyword.trim()
          ? "Tidak ada transaksi yang cocok."
          : "Tidak ada transaksi.";
        tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-500 font-medium">${msg}</td></tr>`;
        return;
      }

      filtered.forEach((tx) => {
        const isVoided = !!tx.is_voided;
        const statusClass = isVoided ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700";
        const statusLabel = isVoided ? "Void" : "Selesai";

        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50/50 transition-colors group cursor-pointer";
        tr.dataset.id = tx.id;
        tr.innerHTML = `
          <td class="py-3 px-4 border-b border-slate-100 text-sm font-medium text-slate-700">${escapeHtml(tx.transaction_number || "-")}</td>
          <td class="py-3 px-4 border-b border-slate-100 text-sm text-slate-500">${escapeHtml(formatDateTime(tx.created_at))}</td>
          <td class="py-3 px-4 border-b border-slate-100 text-sm font-bold text-slate-700">${escapeHtml(formatCurrency(tx.total_amount))}</td>
          <td class="py-3 px-4 border-b border-slate-100 text-sm">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusClass}">${statusLabel}</span>
          </td>
          <td class="py-3 px-4 border-b border-slate-100 text-sm">
            <div class="flex gap-2">
              <button type="button" class="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500" data-action="detail" data-id="${escapeHtml(tx.id)}">Detail</button>
              ${
                !isVoided
                  ? `<button type="button" class="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500" data-action="void" data-id="${escapeHtml(tx.id)}">Void</button>`
                  : ""
              }
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    async function loadTransactions() {
      const startDate = parseDateDisplay(dateStartInput.value);
      const endDate = parseDateDisplay(dateEndInput.value);

      if (!startDate || !endDate) {
        showMessage("error", "Tanggal wajib diisi.", true);
        return;
      }

      state.isLoading = true;
      syncControls();

      try {
        // Send range to backend. 
        // Note: Backend currently only supports single 'date' but we send range and will update backend next.
        const rows = await window.api.getTransactions({ startDate, endDate });
        if (signal.aborted) return;

        state.transactions = Array.isArray(rows) ? rows : [];
      } catch (error) {
        if (!signal.aborted) {
          showMessage("error", error.message || "Gagal memuat transaksi.", true);
        }
      } finally {
        if (!signal.aborted) {
          state.isLoading = false;
          syncControls();
          renderTransactions();
        }
      }
    }

    function closeDetailModal() {
      detailModal.classList.remove("active");
    }

    async function openDetailModal(transactionId) {
      const data = await window.api.getTransactionDetail(transactionId);
      if (signal.aborted) return;

      const tx = data?.transaction ?? {};
      const items = Array.isArray(data?.items) ? data.items : [];

      const totalAmount = Number(tx.total_amount || 0);
      const paymentAmount = Number(tx.payment_amount || 0);
      const changeAmount = paymentAmount - totalAmount;
      const isVoided = !!tx.is_voided || tx.type === "void";
      const statusLabel = isVoided ? "Void" : "Selesai";
      const statusClass = isVoided ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700";

      detailContent.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-8 mb-8 p-4 bg-slate-50 rounded-xl border border-slate-200 shadow-sm text-sm">
          <div>
            <p class="text-slate-500 font-medium mb-1 truncate text-xs uppercase tracking-wider">No Transaksi</p>
            <p class="font-bold text-slate-800 break-words">${escapeHtml(tx.transaction_number || "-")}</p>
          </div>
          <div>
            <p class="text-slate-500 font-medium mb-1 truncate text-xs uppercase tracking-wider">Tanggal</p>
            <p class="font-semibold text-slate-700">${escapeHtml(formatDateTime(tx.created_at))}</p>
          </div>
          <div>
            <p class="text-slate-500 font-medium mb-1 truncate text-xs uppercase tracking-wider">Status</p>
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusClass}">${statusLabel}</span>
          </div>
          <div>
            <p class="text-slate-500 font-medium mb-1 truncate text-xs uppercase tracking-wider">Jumlah Item</p>
            <p class="font-semibold text-slate-700">${items.length}</p>
          </div>
          <div>
            <p class="text-slate-500 font-medium mb-1 truncate text-xs uppercase tracking-wider">Total</p>
            <p class="font-bold text-slate-800">${escapeHtml(formatCurrency(totalAmount))}</p>
          </div>
          <div class="col-span-2 md:col-span-1 border-t border-slate-200 md:border-t-0 md:border-l pl-0 md:pl-4 pt-4 md:pt-0">
            <p class="text-slate-500 font-medium mb-1 truncate text-xs uppercase tracking-wider">Bayar</p>
            <p class="font-bold text-emerald-600">${escapeHtml(formatCurrency(paymentAmount))}</p>
            <p class="text-slate-500 font-medium mt-2 mb-1 truncate text-xs uppercase tracking-wider">Kembalian</p>
            <p class="font-bold text-slate-700">${escapeHtml(formatCurrency(changeAmount >= 0 ? changeAmount : 0))}</p>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table class="w-full text-left border-collapse min-w-full">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>
                <th class="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Barang</th>
                <th class="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Qty</th>
                <th class="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Harga</th>
                <th class="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right w-32">Subtotal</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${
                items.length
                  ? items
                      .map(
                        (item) => `
                          <tr class="hover:bg-slate-50/50 transition-colors">
                            <td class="py-3 px-4 text-sm font-medium text-slate-700">${escapeHtml(item.name || "-")}</td>
                            <td class="py-3 px-4 text-sm text-slate-600 whitespace-nowrap">${escapeHtml(item.quantity)}</td>
                            <td class="py-3 px-4 text-sm text-slate-600">${escapeHtml(formatCurrency(item.selling_price))}</td>
                            <td class="py-3 px-4 text-sm font-semibold text-slate-700 text-right">${escapeHtml(formatCurrency(item.subtotal))}</td>
                          </tr>
                        `,
                      )
                      .join("")
                  : `<tr><td colspan="4" class="py-6 text-center text-slate-500 font-medium text-sm">Tidak ada item</td></tr>`
              }
            </tbody>
          </table>
        </div>
      `;

      detailModal.classList.add("active");
    }

    function closeVoidModal() {
      if (state.isVoiding) return;
      state.selectedTransactionId = null;
      voidModal.classList.remove("active");
      syncControls();
    }

    function openVoidModal(transactionId) {
      const tx = state.transactions.find(
        (item) => String(item.id) === String(transactionId),
      );

      if (!tx || !canVoidTransaction(tx)) return;

      state.selectedTransactionId = tx.id;
      voidInfo.textContent = `Void transaksi ${tx.transaction_number}? Stok akan dikembalikan.`;
      voidModal.classList.add("active");
      syncControls();
    }

    async function submitVoidTransaction() {
      if (!state.selectedTransactionId || state.isVoiding) return;

      state.isVoiding = true;
      syncControls();

      try {
        await window.api.voidTransaction(state.selectedTransactionId);
        if (signal.aborted) return;

        voidModal.classList.remove("active");
        state.selectedTransactionId = null;
        showMessage("success", "Transaksi berhasil di-void.");

        await loadTransactions();
      } catch (error) {
        if (!signal.aborted) {
          showMessage("error", error.message || "Void transaksi gagal.", true);
        }
      } finally {
        if (!signal.aborted) {
          state.isVoiding = false;
          syncControls();
        }
      }
    }

    btnLoad.addEventListener(
      "click",
      () => {
        loadTransactions().catch((error) => {
          if (!signal.aborted) {
            showMessage("error", error.message || "Gagal memuat transaksi.", true);
          }
        });
      },
      { signal },
    );

    searchInput.addEventListener(
      "input",
      () => {
        state.keyword = searchInput.value || "";
        renderTransactions();
      },
      { signal },
    );

    tbody.addEventListener(
      "click",
      (event) => {
        const detailButton = event.target.closest("button[data-action='detail']");
        if (detailButton) {
          openDetailModal(detailButton.dataset.id).catch((error) => {
            if (!signal.aborted) {
              showMessage("error", error.message || "Gagal memuat detail transaksi.", true);
            }
          });
          return;
        }

        const voidButton = event.target.closest("button[data-action='void']");
        if (voidButton) {
          openVoidModal(voidButton.dataset.id);
          return;
        }

        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        openDetailModal(row.dataset.id).catch((error) => {
          if (!signal.aborted) {
            showMessage(
              "error",
              error.message || "Gagal memuat detail transaksi.",
              true,
            );
          }
        });
      },
      { signal },
    );

    closeDetail.addEventListener(
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

    cancelVoid.addEventListener(
      "click",
      () => {
        closeVoidModal();
      },
      { signal },
    );

    confirmVoid.addEventListener(
      "click",
      () => {
        submitVoidTransaction().catch((error) => {
          if (!signal.aborted) {
            showMessage("error", error.message || "Void transaksi gagal.", true);
          }
        });
      },
      { signal },
    );

    voidModal.addEventListener(
      "click",
      (event) => {
        if (event.target === voidModal) {
          closeVoidModal();
        }
      },
      { signal },
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape") return;

        if (voidModal.classList.contains("active")) {
          closeVoidModal();
          return;
        }

        if (detailModal.classList.contains("active")) {
          closeDetailModal();
        }
      },
      { signal },
    );

    loadTransactions().catch((error) => {
      if (!signal.aborted) {
        showMessage("error", error.message || "Gagal memuat transaksi.", true);
      }
    });

    return () => {
      eventController.abort();
      closeDetailModal();
      closeVoidModal();
      clearMessage();
    };
  }

  window.pageModules = window.pageModules || {};
  window.pageModules.transactions = { init: initTransactions };
})();
