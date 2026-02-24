(() => {
  function initKasir() {
    const barcodeInput = document.getElementById("barcode");
    const cartBody = document.getElementById("cart-body");
    const receiptPreviewContainer = document.getElementById(
      "receipt-preview-container",
    );
    const totalBigInput = document.getElementById("total-big-input");
    const totalBigPayment = document.getElementById("total-big-payment");
    const paidInput = document.getElementById("paid");

    const sessionInput = document.getElementById("session-input");
    const sessionPayment = document.getElementById("session-payment");
    const warningEl = document.getElementById("kasir-warning");

    const btnCancelInput = document.getElementById("btn-cancel-input");
    const btnProcessInput = document.getElementById("btn-process-input");
    const btnCancelPayment = document.getElementById("btn-cancel-payment");
    const btnPay = document.getElementById("btn-pay");

    const nominalShortcuts = document.getElementById("nominal-shortcuts");
    const smartExact = document.getElementById("smart-exact");
    const smartRoundNear = document.getElementById("smart-round-near");
    const smartRoundHigh = document.getElementById("smart-round-high");

    const cancelConfirmModal = document.getElementById("cancel-confirm-modal");
    const cancelConfirmNo = document.getElementById("cancel-confirm-no");
    const cancelConfirmYes = document.getElementById("cancel-confirm-yes");

    const changeModal = document.getElementById("change-modal");
    const changeAmountEl = document.getElementById("change-amount");
    const closeChangeModalBtn = document.getElementById("close-change-modal");

    const btnOpenManualItem = document.getElementById("btn-open-manual-item");
    const manualItemModal = document.getElementById("manual-item-modal");
    const nonbcSearch = document.getElementById("nonbc-search");
    const nonbcProductList = document.getElementById("nonbc-product-list");
    const manualItemQty = document.getElementById("manual-item-qty");
    const nonbcSummary = document.getElementById("nonbc-summary");
    const nonbcProductName = document.getElementById("nonbc-product-name");
    const nonbcProductPrice = document.getElementById("nonbc-product-price");
    const nonbcProductUnit = document.getElementById("nonbc-product-unit");
    const nonbcSubtotal = document.getElementById("nonbc-subtotal");
    const manualItemError = document.getElementById("manual-item-error");
    const manualItemCancel = document.getElementById("manual-item-cancel");
    const manualItemSubmit = document.getElementById("manual-item-submit");

    if (
      !barcodeInput ||
      !cartBody ||
      !receiptPreviewContainer ||
      !totalBigInput ||
      !totalBigPayment ||
      !paidInput ||
      !sessionInput ||
      !sessionPayment ||
      !warningEl ||
      !btnCancelInput ||
      !btnProcessInput ||
      !btnCancelPayment ||
      !btnPay ||
      !nominalShortcuts ||
      !smartExact ||
      !smartRoundNear ||
      !smartRoundHigh ||
      !cancelConfirmModal ||
      !cancelConfirmNo ||
      !cancelConfirmYes ||
      !changeModal ||
      !changeAmountEl ||
      !closeChangeModalBtn ||
      !btnOpenManualItem ||
      !manualItemModal ||
      !nonbcSearch ||
      !nonbcProductList ||
      !manualItemQty ||
      !nonbcSummary ||
      !nonbcProductName ||
      !nonbcProductPrice ||
      !nonbcProductUnit ||
      !nonbcSubtotal ||
      !manualItemError ||
      !manualItemCancel ||
      !manualItemSubmit
    ) {
      console.error("[Kasir] elemen wajib tidak ditemukan.");
      return () => {};
    }

    const renderReceipt =
      window.receiptRenderer?.renderReceipt || window.renderReceipt;
    if (typeof renderReceipt !== "function") {
      console.error("[Kasir] renderReceipt tidak tersedia.");
      return () => {};
    }

    const eventController = new AbortController();
    const { signal } = eventController;
    const stockValidationVersions = new Map();

    const state = {
      mode: "INPUT",
      cart: [],
      total: 0,
      paymentAmount: 0,
      qtyEditor: null,
      qtyEditCommitTask: null,
      warningTimerId: null,
      isPaying: false,
      cancelResolver: null,
    };

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function formatRupiah(value) {
      return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
    }

    function sanitizeQty(value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 1) {
        return 1;
      }
      return Math.trunc(parsed);
    }

    function sanitizePayment(value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return 0;
      }
      return Math.trunc(parsed);
    }

    function setPaymentAmount(value, syncInput = true) {
      state.paymentAmount = sanitizePayment(value);
      if (!syncInput) return;
      paidInput.value = state.paymentAmount > 0 ? String(state.paymentAmount) : "";
      renderPaymentReceiptPreview();
    }

    function showWarning(message) {
      warningEl.textContent = message;
      warningEl.classList.add("active");

      if (state.warningTimerId) {
        clearTimeout(state.warningTimerId);
      }

      state.warningTimerId = setTimeout(() => {
        warningEl.classList.remove("active");
      }, 2600);
    }

    function clearWarning() {
      if (state.warningTimerId) {
        clearTimeout(state.warningTimerId);
        state.warningTimerId = null;
      }
      warningEl.classList.remove("active");
      warningEl.textContent = "";
    }

    function updateSubtotal(item) {
      item.subtotal = Number(item.qty) * Number(item.price);
    }

    function updateTotal() {
      state.total = state.cart.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    }

    function openModal(modalEl) {
      modalEl.classList.add("active");
      modalEl.setAttribute("aria-hidden", "false");
    }

    function closeModal(modalEl) {
      modalEl.classList.remove("active");
      modalEl.setAttribute("aria-hidden", "true");
    }

    function isModalActive(modalEl) {
      return modalEl.classList.contains("active");
    }

    function isAnyModalActive() {
      return isModalActive(cancelConfirmModal) || isModalActive(changeModal) || isModalActive(manualItemModal);
    }

    function focusModeElement() {
      if (isAnyModalActive()) return;

      if (state.mode === "INPUT") {
        barcodeInput.focus();
        return;
      }

      paidInput.focus();
      paidInput.select();
    }

    function isEnterShortcutTarget(element) {
      if (!element) return true;

      if (element.classList?.contains("qty-input-edit")) {
        return false;
      }

      const tagName = element.tagName;
      if (tagName === "BUTTON" || tagName === "SELECT" || tagName === "TEXTAREA") {
        return false;
      }

      if (tagName === "INPUT" && element !== barcodeInput && element !== paidInput) {
        return false;
      }

      return true;
    }

    function setMode(nextMode, options = {}) {
      const mode = nextMode === "PAYMENT" ? "PAYMENT" : "INPUT";
      state.mode = mode;

      sessionInput.classList.toggle("active", mode === "INPUT");
      sessionPayment.classList.toggle("active", mode === "PAYMENT");

      syncControls();

      if (options.focus === false) return;
      focusModeElement();
    }

    function getSmartAmounts(total) {
      const normalizedTotal = Math.max(0, Math.trunc(total || 0));
      const exact = normalizedTotal;

      if (!exact) {
        return { exact: 0, near: 0, high: 0 };
      }

      let near = Math.ceil(exact / 5000) * 5000;
      let high = Math.ceil(exact / 10000) * 10000;

      if (near <= exact) near = exact + 5000;
      if (high <= near) high = near + 5000;

      return { exact, near, high };
    }

    function renderSmartShortcuts() {
      const { exact, near, high } = getSmartAmounts(state.total);

      smartExact.dataset.amount = String(exact);
      smartRoundNear.dataset.amount = String(near);
      smartRoundHigh.dataset.amount = String(high);

      smartExact.textContent = exact
        ? `Pas (${formatRupiah(exact)})`
        : "Pas";
      smartRoundNear.textContent = near
        ? `Bulat 5K (${formatRupiah(near)})`
        : "Bulat 5K";
      smartRoundHigh.textContent = high
        ? `Bulat 10K (${formatRupiah(high)})`
        : "Bulat 10K";
    }

    function buildPreviewReceiptData() {
      return {
        transactionNumber: "PREVIEW",
        transactionDate: new Date(),
        items: state.cart.map((item) => ({
          name: item.name,
          quantity: item.qty,
          selling_price: item.price,
          subtotal: item.subtotal,
        })),
        totalAmount: state.total,
        paymentAmount: state.paymentAmount,
        changeAmount: Math.max(0, state.paymentAmount - state.total),
      };
    }

    function renderPaymentReceiptPreview() {
      try {
        renderReceipt(receiptPreviewContainer, buildPreviewReceiptData());
      } catch (error) {
        console.error("[Kasir] gagal render preview struk:", error);
      }
    }

    function renderCart() {
      updateTotal();
      const formattedTotal = formatRupiah(state.total);

      cartBody.innerHTML = "";

      if (!state.cart.length) {
        cartBody.innerHTML = `
            <td colspan="4" class="px-6 py-12 text-center text-slate-400 italic">
              <div class="flex flex-col items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shopping-cart"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                <p>Keranjang masih kosong.</p>
                <p class="text-xs">Scan barcode atau gunakan tombol Manual Item.</p>
              </div>
            </td>
          </tr>
        `;
      } else {
        state.cart.forEach((item, index) => {
          const cartRow = document.createElement("tr");
          cartRow.className = "hover:bg-slate-50 transition-colors";
          const nonbcBadge = item.is_non_barcode
            ? `<span class="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Non-Barcode</span>`
            : "";
          cartRow.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-medium">${escapeHtml(item.name)}${nonbcBadge}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
              <div class="flex items-center justify-center gap-2">
                <button type="button" class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-colors" data-action="minus" data-index="${index}">-</button>
                <span class="w-10 text-center font-bold text-slate-800 qty-text cursor-pointer hover:bg-slate-100 rounded px-1" data-index="${index}">${item.qty}</span>
                <button type="button" class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-colors" data-action="plus" data-index="${index}">+</button>
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-700 text-right">${escapeHtml(formatRupiah(item.price))}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-emerald-600 text-right">${escapeHtml(formatRupiah(item.subtotal))}</td>
          `;
          cartBody.appendChild(cartRow);
        });
      }

      totalBigInput.textContent = formattedTotal;
      totalBigPayment.textContent = formattedTotal;

      renderSmartShortcuts();
      renderPaymentReceiptPreview();
      syncControls();
    }

    function syncControls() {
      const isInputMode = state.mode === "INPUT";
      const isPaymentMode = state.mode === "PAYMENT";
      const hasCart = state.cart.length > 0;

      barcodeInput.disabled = !isInputMode || state.isPaying;
      paidInput.disabled = !isPaymentMode || state.isPaying;

      btnCancelInput.disabled = !isInputMode || state.isPaying;
      btnProcessInput.disabled = !isInputMode || state.isPaying;
      btnCancelPayment.disabled = !isPaymentMode || state.isPaying;
      btnPay.disabled = !isPaymentMode || state.isPaying || !hasCart;

      nominalShortcuts
        .querySelectorAll("button[data-amount]")
        .forEach((button) => {
          button.disabled = !isPaymentMode || state.isPaying;
        });

      [smartExact, smartRoundNear, smartRoundHigh].forEach((button) => {
        const amount = sanitizePayment(button.dataset.amount);
        button.disabled = !isPaymentMode || state.isPaying || !amount;
      });
    }

    async function resolveQtyByStock(productId, requestedQty) {
      const normalizedQty = sanitizeQty(requestedQty);
      const version = (stockValidationVersions.get(productId) || 0) + 1;
      stockValidationVersions.set(productId, version);

      const { totalStock } = await window.api.checkStock(productId);
      if (signal.aborted) {
        return { resolvedQty: normalizedQty, totalStock: 0, shouldApply: false };
      }

      if (stockValidationVersions.get(productId) !== version) {
        return { resolvedQty: normalizedQty, totalStock: 0, shouldApply: false };
      }

      const availableStock = Math.max(0, Number(totalStock) || 0);
      if (availableStock <= 0) {
        return { resolvedQty: 0, totalStock: 0, shouldApply: true };
      }

      if (normalizedQty > availableStock) {
        return {
          resolvedQty: availableStock,
          totalStock: availableStock,
          shouldApply: true,
        };
      }

      return {
        resolvedQty: normalizedQty,
        totalStock: availableStock,
        shouldApply: true,
      };
    }

    async function applyQtyByProductId(productId, requestedQty) {
      const normalizedRequestedQty = sanitizeQty(requestedQty);
      const itemIndex = state.cart.findIndex((item) => item.product_id === productId);
      if (itemIndex === -1) return;

      const stockResult = await resolveQtyByStock(productId, normalizedRequestedQty);
      if (!stockResult.shouldApply) return;

      if (stockResult.resolvedQty <= 0) {
        state.cart.splice(itemIndex, 1);
        showWarning("Stok habis. Item dihapus dari keranjang.");
        return;
      }

      if (stockResult.resolvedQty !== normalizedRequestedQty) {
        showWarning(`Stok tidak cukup. Maksimal: ${stockResult.totalStock}`);
      }

      const item = state.cart[itemIndex];
      item.qty = stockResult.resolvedQty;
      updateSubtotal(item);
    }

    async function finishQtyEdit(mode = "commit") {
      if (!state.qtyEditor) {
        if (state.qtyEditCommitTask) {
          await state.qtyEditCommitTask;
        }
        return;
      }

      const activeEditor = state.qtyEditor;
      state.qtyEditor = null;

      if (activeEditor.done) {
        if (state.qtyEditCommitTask) {
          await state.qtyEditCommitTask;
        }
        return;
      }

      activeEditor.done = true;

      const commitTask = (async () => {
        if (mode === "cancel") {
          renderCart();
          return;
        }

        const requestedQty = sanitizeQty(activeEditor.input.value);
        await applyQtyByProductId(activeEditor.productId, requestedQty);
        renderCart();
      })();

      state.qtyEditCommitTask = commitTask;

      try {
        await commitTask;
      } finally {
        if (state.qtyEditCommitTask === commitTask) {
          state.qtyEditCommitTask = null;
        }
      }
    }

    function startQtyEdit(index, qtyTextEl) {
      const item = state.cart[index];
      if (!item || !qtyTextEl || !qtyTextEl.isConnected) return;

      const inputQty = document.createElement("input");
      inputQty.type = "number";
      inputQty.min = "1";
      inputQty.step = "1";
      inputQty.value = String(item.qty);
      inputQty.className = "qty-input-edit w-16 p-1 text-center font-bold text-slate-800 border-2 border-emerald-500 rounded focus:ring-2 focus:ring-emerald-200 outline-none";

      qtyTextEl.replaceWith(inputQty);

      const editorState = {
        input: inputQty,
        productId: item.product_id,
        done: false,
      };
      state.qtyEditor = editorState;

      inputQty.focus();
      inputQty.select();

      inputQty.addEventListener(
        "keydown",
        async (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            await finishQtyEdit("commit");
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            await finishQtyEdit("cancel");
          }
        },
        { signal },
      );

      inputQty.addEventListener(
        "blur",
        () => {
          finishQtyEdit("commit").catch((error) => {
            if (!signal.aborted) {
              console.error("[Kasir] gagal menyimpan qty:", error);
              renderCart();
            }
          });
        },
        { once: true, signal },
      );
    }

    async function addProductByBarcode(barcode) {
      if (!barcode) return;

      const product = await window.api.findProductByBarcode(barcode);
      if (!product) {
        showWarning("Produk tidak ditemukan.");
        return;
      }

      const existing = state.cart.find((item) => item.product_id === product.id);

      if (existing) {
        await applyQtyByProductId(existing.product_id, existing.qty + 1);
      } else {
        const stockResult = await resolveQtyByStock(product.id, 1);
        if (!stockResult.shouldApply || stockResult.resolvedQty <= 0) {
          showWarning("Stok produk habis.");
          return;
        }

        state.cart.push({
          product_id: product.id,
          name: product.name,
          price: Number(product.selling_price),
          qty: 1,
          subtotal: Number(product.selling_price),
        });
      }

      renderCart();
    }

    async function validateCartStock() {
      if (!state.cart.length) {
        showWarning("Keranjang kosong.");
        return false;
      }

      let changed = false;
      const messages = [];

      for (const currentItem of [...state.cart]) {
        const rowIndex = state.cart.findIndex(
          (item) => item.product_id === currentItem.product_id,
        );
        if (rowIndex === -1) continue;

        const stockResponse = await window.api.checkStock(currentItem.product_id);
        if (signal.aborted) {
          return false;
        }

        const availableStock = Math.max(0, Number(stockResponse?.totalStock) || 0);
        const liveItem = state.cart[rowIndex];
        if (!liveItem) continue;

        if (availableStock <= 0) {
          messages.push(`${liveItem.name} habis, item dihapus.`);
          state.cart.splice(rowIndex, 1);
          changed = true;
          continue;
        }

        if (liveItem.qty > availableStock) {
          liveItem.qty = availableStock;
          updateSubtotal(liveItem);
          messages.push(`${liveItem.name} disesuaikan ke qty ${availableStock}.`);
          changed = true;
        }
      }

      if (changed) {
        renderCart();
      }

      if (!state.cart.length) {
        showWarning("Keranjang kosong setelah penyesuaian stok.");
        if (state.mode === "PAYMENT") {
          setMode("INPUT");
        }
        return false;
      }

      if (messages.length) {
        showWarning(messages[0]);
      }

      return true;
    }

    function resetKasir(options = {}) {
      state.cart = [];
      state.total = 0;
      state.qtyEditor = null;
      state.qtyEditCommitTask = null;
      setPaymentAmount(0);
      clearWarning();
      renderCart();

      if (options.keepMode) return;
      setMode("INPUT");
    }

    function openChangeModal(changeAmount) {
      changeAmountEl.textContent = formatRupiah(changeAmount);
      openModal(changeModal);
    }

    function closeChangeModal() {
      closeModal(changeModal);
      focusModeElement();
    }

    function closeCancelConfirmModal(result = false) {
      closeModal(cancelConfirmModal);

      if (state.cancelResolver) {
        state.cancelResolver(result);
        state.cancelResolver = null;
      }
    }

    function askCancelConfirmation() {
      if (state.cancelResolver) {
        closeCancelConfirmModal(false);
      }

      openModal(cancelConfirmModal);
      return new Promise((resolve) => {
        state.cancelResolver = resolve;
      });
    }

    async function handleCancelInput() {
      await finishQtyEdit("commit");
      const confirmed = await askCancelConfirmation();
      if (!confirmed || signal.aborted) return;

      resetKasir();
    }

    async function handleProcessInput() {
      if (state.mode !== "INPUT") return;

      await finishQtyEdit("commit");

      if (!state.cart.length) {
        showWarning("Keranjang kosong.");
        return;
      }

      const isValidStock = await validateCartStock();
      if (!isValidStock) return;

      setPaymentAmount(0);
      setMode("PAYMENT");
    }

    function applyShortcutAmount(amount) {
      const normalizedAmount = sanitizePayment(amount);
      if (!normalizedAmount) return;

      setPaymentAmount(normalizedAmount);
      paidInput.focus();
      paidInput.select();
    }

    async function handlePay() {
      if (state.mode !== "PAYMENT" || state.isPaying) return;

      await finishQtyEdit("commit");

      if (!state.cart.length) {
        showWarning("Keranjang kosong.");
        setMode("INPUT");
        return;
      }

      const isValidStock = await validateCartStock();
      if (!isValidStock) return;

      const paymentAmount = sanitizePayment(state.paymentAmount || paidInput.value);
      setPaymentAmount(paymentAmount);

      if (!paymentAmount) {
        showWarning("Masukkan nominal pembayaran.");
        paidInput.focus();
        return;
      }

      if (paymentAmount < state.total) {
        showWarning("Nominal pembayaran kurang.");
        paidInput.focus();
        paidInput.select();
        return;
      }

      state.isPaying = true;
      syncControls();

      try {
        const result = await window.api.processSale({
          cartItems: state.cart.map((item) => ({
            product_id: item.product_id,
            quantity: item.qty,
            selling_price: item.price,
            is_non_barcode: item.is_non_barcode || false,
            name: item.name,
          })),
          paymentAmount,
        });

        if (signal.aborted) return;

        await window.api.printReceipt(result.transactionId);
        if (signal.aborted) return;

        const totalAmount = Number(result.totalAmount || state.total);
        const changeAmount = Math.max(0, Number(paymentAmount - totalAmount));

        resetKasir();
        openChangeModal(changeAmount);
      } catch (error) {
        if (!signal.aborted) {
          showWarning(error?.message || "Transaksi gagal diproses.");
        }
      } finally {
        if (!signal.aborted) {
          state.isPaying = false;
          syncControls();
        }
      }
    }

    cartBody.addEventListener(
      "click",
      async (event) => {
        try {
          const actionButton = event.target.closest("button[data-action]");
          if (actionButton) {
            const index = Number(actionButton.dataset.index);
            const action = actionButton.dataset.action;
            const item = state.cart[index];
            if (!item) return;

            await finishQtyEdit("commit");

            if (item.is_non_barcode) {
              if (action === "plus") {
                const stockResult = await resolveQtyByStock(item.product_id, item.qty + 1);
                if (!stockResult.shouldApply) return;
                if (stockResult.resolvedQty <= 0) {
                  showWarning("Stok produk habis.");
                  return;
                }
                if (stockResult.resolvedQty <= item.qty) {
                  showWarning(`Stok ${item.name} tersisa ${stockResult.totalStock}.`);
                  return;
                }
                item.qty = stockResult.resolvedQty;
                updateSubtotal(item);
                renderCart();
                return;
              }
              if (action === "minus" && item.qty > 1) {
                item.qty -= 1;
                updateSubtotal(item);
                renderCart();
              }
              return;
            }

            const productId = item.product_id;
            if (!productId) return;

            const currentIndex = state.cart.findIndex(
              (ci) => ci.product_id === productId,
            );
            if (currentIndex === -1) return;

            if (action === "plus") {
              await applyQtyByProductId(productId, state.cart[currentIndex].qty + 1);
              renderCart();
              return;
            }

            if (action === "minus" && state.cart[currentIndex].qty > 1) {
              state.cart[currentIndex].qty -= 1;
              updateSubtotal(state.cart[currentIndex]);
              renderCart();
            }
            return;
          }

          const qtyText = event.target.closest(".qty-text");
          if (!qtyText) return;

          const index = Number(qtyText.dataset.index);
          if (Number.isNaN(index) || !state.cart[index]) return;

          await finishQtyEdit("commit");
          startQtyEdit(index, qtyText);
        } catch (error) {
          if (!signal.aborted) {
            console.error("[Kasir] aksi keranjang gagal:", error);
            showWarning("Terjadi kesalahan saat mengubah qty.");
            renderCart();
          }
        }
      },
      { signal },
    );

    barcodeInput.addEventListener(
      "keydown",
      async (event) => {
        if (event.key !== "Enter" || state.mode !== "INPUT") return;

        event.preventDefault();
        const barcode = barcodeInput.value.trim();
        barcodeInput.value = "";

        if (!barcode) return;

        try {
          await finishQtyEdit("commit");
          await addProductByBarcode(barcode);
        } catch (error) {
          if (!signal.aborted) {
            console.error("[Kasir] gagal menambah produk:", error);
            showWarning("Gagal menambah produk ke keranjang.");
          }
        }
      },
      { signal },
    );

    btnCancelInput.addEventListener(
      "click",
      () => {
        handleCancelInput().catch((error) => {
          if (!signal.aborted) {
            showWarning(error?.message || "Gagal membatalkan transaksi.");
          }
        });
      },
      { signal },
    );

    btnProcessInput.addEventListener(
      "click",
      () => {
        handleProcessInput().catch((error) => {
          if (!signal.aborted) {
            showWarning(error?.message || "Gagal proses transaksi.");
          }
        });
      },
      { signal },
    );

    btnCancelPayment.addEventListener(
      "click",
      () => {
        if (state.isPaying) return;
        setMode("INPUT");
      },
      { signal },
    );

    btnPay.addEventListener(
      "click",
      () => {
        handlePay().catch((error) => {
          if (!signal.aborted) {
            showWarning(error?.message || "Transaksi gagal diproses.");
          }
        });
      },
      { signal },
    );

    paidInput.addEventListener(
      "input",
      () => {
        setPaymentAmount(paidInput.value, false);
        renderPaymentReceiptPreview();
      },
      { signal },
    );

    paidInput.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        handlePay().catch((error) => {
          if (!signal.aborted) {
            showWarning(error?.message || "Transaksi gagal diproses.");
          }
        });
      },
      { signal },
    );

    sessionPayment.addEventListener(
      "click",
      (event) => {
        const amountButton = event.target.closest("button[data-amount]");
        if (!amountButton) return;

        applyShortcutAmount(amountButton.dataset.amount);
      },
      { signal },
    );

    cancelConfirmNo.addEventListener(
      "click",
      () => {
        closeCancelConfirmModal(false);
        focusModeElement();
      },
      { signal },
    );

    cancelConfirmYes.addEventListener(
      "click",
      () => {
        closeCancelConfirmModal(true);
      },
      { signal },
    );

    cancelConfirmModal.addEventListener(
      "click",
      (event) => {
        if (event.target !== cancelConfirmModal) return;
        closeCancelConfirmModal(false);
        focusModeElement();
      },
      { signal },
    );

    closeChangeModalBtn.addEventListener(
      "click",
      () => {
        closeChangeModal();
      },
      { signal },
    );

    changeModal.addEventListener(
      "click",
      (event) => {
        if (event.target !== changeModal) return;
        closeChangeModal();
      },
      { signal },
    );

    /* ========================
       NON-BARCODE PRODUCT MODAL
    ======================== */

    let nonbcProducts = [];
    let selectedNonbcProduct = null;

    function showManualItemError(message) {
      manualItemError.textContent = message;
      manualItemError.classList.remove("hidden");
    }

    function clearManualItemError() {
      manualItemError.classList.add("hidden");
      manualItemError.textContent = "";
    }

    function renderNonbcProductList(filter = "") {
      const keyword = filter.toLowerCase();
      const filtered = keyword
        ? nonbcProducts.filter((p) =>
            p.name.toLowerCase().includes(keyword),
          )
        : nonbcProducts;

      nonbcProductList.innerHTML = "";

      if (!filtered.length) {
        nonbcProductList.innerHTML =
          '<div class="col-span-1 md:col-span-2 py-8 text-center text-slate-500 italic">Tidak ada produk ditemukan.</div>';
        return;
      }

      filtered.forEach((product) => {
        const div = document.createElement("div");
        div.className = "nonbc-product-item p-4 border rounded-xl hover:bg-emerald-50 hover:border-emerald-200 cursor-pointer transition-all border-slate-200 bg-white shadow-sm flex flex-col gap-1";
        if (selectedNonbcProduct && selectedNonbcProduct.id === product.id) {
          div.classList.add("selected");
        }
        div.dataset.productId = product.id;
        div.innerHTML = `
          <div class="flex justify-between items-start">
            <span class="font-bold text-slate-800">${escapeHtml(product.name)}</span>
            <span class="text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-1 rounded-lg border border-slate-200">${escapeHtml(product.unit || "pcs")}</span>
          </div>
          <span class="text-emerald-600 font-bold">${formatRupiah(product.selling_price)}</span>
        `;
        nonbcProductList.appendChild(div);
      });
    }

    function selectNonbcProduct(product) {
      selectedNonbcProduct = product;
      nonbcProductName.textContent = product.name;
      nonbcProductPrice.textContent = formatRupiah(product.selling_price);
      nonbcProductUnit.textContent = product.unit || "pcs";
      updateNonbcSummary();
      nonbcSummary.style.display = "";

      nonbcProductList.querySelectorAll(".nonbc-product-item").forEach((el) => {
        el.classList.toggle("selected", el.dataset.productId === product.id);
      });
    }

    function updateNonbcSummary() {
      if (!selectedNonbcProduct) {
        nonbcSummary.style.display = "none";
        return;
      }
      const qty = Number(manualItemQty.value) || 0;
      const subtotal = qty * Number(selectedNonbcProduct.selling_price);
      nonbcSubtotal.textContent = formatRupiah(subtotal);
    }

    function resetManualItemForm() {
      nonbcSearch.value = "";
      manualItemQty.value = "";
      selectedNonbcProduct = null;
      nonbcSummary.style.display = "none";
      nonbcProductList.innerHTML = "";
      clearManualItemError();
    }

    async function openManualItemModal() {
      if (state.mode !== "INPUT" || state.isPaying) return;
      resetManualItemForm();
      openModal(manualItemModal);

      try {
        nonbcProducts = await window.api.getEcerProducts();
      } catch (error) {
        nonbcProducts = [];
        console.error("[Kasir] gagal mengambil produk non-barcode:", error);
      }

      renderNonbcProductList();
      nonbcSearch.focus();
    }

    function closeManualItemModal() {
      closeModal(manualItemModal);
      focusModeElement();
    }

    async function submitManualItem() {
      clearManualItemError();

      if (!selectedNonbcProduct) {
        showManualItemError("Pilih produk terlebih dahulu.");
        return;
      }

      const qtyRaw = Number(manualItemQty.value);
      if (!Number.isFinite(qtyRaw) || qtyRaw <= 0) {
        showManualItemError("Qty harus lebih dari 0.");
        manualItemQty.focus();
        return;
      }

      const product = selectedNonbcProduct;
      const price = Number(product.selling_price);

      const existing = state.cart.find(
        (item) => item.product_id === product.id && item.is_non_barcode,
      );
      const currentCartQty = existing ? existing.qty : 0;
      const totalRequestedQty = currentCartQty + qtyRaw;

      const stockResult = await resolveQtyByStock(product.id, totalRequestedQty);
      if (!stockResult.shouldApply) return;

      if (stockResult.resolvedQty <= 0) {
        showManualItemError("Stok produk habis, tidak dapat ditambahkan.");
        return;
      }

      if (stockResult.resolvedQty < totalRequestedQty) {
        const availableToAdd = stockResult.resolvedQty - currentCartQty;
        if (availableToAdd <= 0) {
          showManualItemError(`Stok ${product.name} tersisa ${stockResult.totalStock}, sudah ada ${currentCartQty} di keranjang.`);
          return;
        }
        showWarning(`Stok ${product.name} tersisa ${stockResult.totalStock}, qty disesuaikan.`);
      }

      const qty = stockResult.resolvedQty;

      if (existing) {
        existing.qty = qty;
        updateSubtotal(existing);
      } else {
        state.cart.push({
          product_id: product.id,
          name: product.name,
          price: price,
          qty: qty,
          subtotal: qty * price,
          unit: product.unit || "pcs",
          is_non_barcode: true,
        });
      }

      closeManualItemModal();
      renderCart();
    }

    nonbcProductList.addEventListener(
      "click",
      (event) => {
        const item = event.target.closest(".nonbc-product-item");
        if (!item) return;
        const productId = item.dataset.productId;
        const product = nonbcProducts.find((p) => p.id === productId);
        if (product) {
          selectNonbcProduct(product);
          manualItemQty.focus();
        }
      },
      { signal },
    );

    nonbcSearch.addEventListener(
      "input",
      () => {
        renderNonbcProductList(nonbcSearch.value);
      },
      { signal },
    );

    manualItemQty.addEventListener(
      "input",
      () => {
        updateNonbcSummary();
      },
      { signal },
    );

    btnOpenManualItem.addEventListener(
      "click",
      () => {
        openManualItemModal();
      },
      { signal },
    );

    manualItemCancel.addEventListener(
      "click",
      () => {
        closeManualItemModal();
      },
      { signal },
    );

    manualItemSubmit.addEventListener(
      "click",
      () => {
        submitManualItem();
      },
      { signal },
    );

    manualItemModal.addEventListener(
      "click",
      (event) => {
        if (event.target !== manualItemModal) return;
        closeManualItemModal();
      },
      { signal },
    );

    manualItemModal.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          submitManualItem();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeManualItemModal();
        }
      },
      { signal },
    );

    /* ========================
       GLOBAL KEYDOWN
    ======================== */

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.ctrlKey && event.key.toLowerCase() === "m" && !event.repeat) {
          event.preventDefault();
          openManualItemModal();
          return;
        }

        if (event.key === "Escape") {
          if (isModalActive(manualItemModal)) {
            closeManualItemModal();
            return;
          }

          if (isModalActive(cancelConfirmModal)) {
            closeCancelConfirmModal(false);
            focusModeElement();
            return;
          }

          if (isModalActive(changeModal)) {
            closeChangeModal();
          }
          return;
        }

        if (event.key !== "Enter" || event.repeat || isAnyModalActive()) {
          return;
        }

        const activeElement = document.activeElement;

        if (state.mode === "INPUT") {
          if (activeElement === barcodeInput || !isEnterShortcutTarget(activeElement)) {
            return;
          }

          event.preventDefault();
          handleProcessInput().catch((error) => {
            if (!signal.aborted) {
              showWarning(error?.message || "Gagal proses transaksi.");
            }
          });
          return;
        }

        if (
          state.mode === "PAYMENT" &&
          activeElement !== paidInput &&
          isEnterShortcutTarget(activeElement)
        ) {
          event.preventDefault();
          handlePay().catch((error) => {
            if (!signal.aborted) {
              showWarning(error?.message || "Transaksi gagal diproses.");
            }
          });
        }
      },
      { signal },
    );

    setMode("INPUT", { focus: false });
    setPaymentAmount(0);
    renderCart();
    barcodeInput.focus();

    return () => {
      eventController.abort();
      stockValidationVersions.clear();

      if (state.warningTimerId) {
        clearTimeout(state.warningTimerId);
      }

      if (state.cancelResolver) {
        state.cancelResolver(false);
        state.cancelResolver = null;
      }

      closeModal(cancelConfirmModal);
      closeModal(changeModal);
      closeModal(manualItemModal);

      state.cart = [];
      state.total = 0;
      state.paymentAmount = 0;
      state.qtyEditor = null;
      state.qtyEditCommitTask = null;
      state.isPaying = false;
    };
  }

  window.pageModules = window.pageModules || {};
  window.pageModules.kasir = { init: initKasir };
})();
