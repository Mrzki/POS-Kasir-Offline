(() => {
  function initProducts() {
    const body = document.getElementById("products-body");
    const searchInput = document.getElementById("search-product");
    const btnAdd = document.getElementById("btn-add-product");
    const modal = document.getElementById("product-modal");
    const modalTitle = document.getElementById("modal-title");
    const messageEl = document.getElementById("products-message");
    const confirmModal = document.getElementById("product-confirm-modal");
    const confirmText = document.getElementById("product-confirm-text");
    const confirmToggleBtn = document.getElementById("confirm-product-toggle");
    const cancelToggleBtn = document.getElementById("cancel-product-toggle");

    const nameInput = document.getElementById("product-name");
    const barcodeInput = document.getElementById("product-barcode");
    const categorySelect = document.getElementById("product-category");
    const priceInput = document.getElementById("product-price");
    const unitSelect = document.getElementById("product-unit");
    const minStockInput = document.getElementById("product-min-stock");
    const weighedCheckbox = document.getElementById("product-weighed");

    const saveBtn = document.getElementById("save-product");
    const cancelBtn = document.getElementById("cancel-product");

    if (
      !body ||
      !searchInput ||
      !btnAdd ||
      !modal ||
      !modalTitle ||
      !messageEl ||
      !confirmModal ||
      !confirmText ||
      !confirmToggleBtn ||
      !cancelToggleBtn ||
      !nameInput ||
      !barcodeInput ||
      !categorySelect ||
      !priceInput ||
      !unitSelect ||
      !minStockInput ||
      !weighedCheckbox ||
      !saveBtn ||
      !cancelBtn
    ) {
      console.error("[Products] elemen wajib tidak ditemukan.");
      return () => {};
    }

    const eventController = new AbortController();
    const { signal } = eventController;

    const state = {
      allProducts: [],
      categories: [],
      keyword: "",
      editingId: null,
      isBusy: false,
      feedbackTimerId: null,
      confirmResolver: null,
    };

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
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
        messageEl.className = "hidden";
        messageEl.textContent = "";
      }, 2800);
    }

    function formatRupiah(value) {
      return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
    }

    function getFilteredProducts() {
      const keyword = state.keyword.trim().toLowerCase();
      if (!keyword) return state.allProducts;

      return state.allProducts.filter((item) => {
        const searchable = [item.name, item.barcode, item.category_name, item.unit]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchable.includes(keyword);
      });
    }

    function renderCategories() {
      categorySelect.innerHTML = "";

      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "Tanpa Kategori";
      categorySelect.appendChild(defaultOption);

      state.categories.forEach((category) => {
        const option = document.createElement("option");
        option.value = category.id;
        option.textContent = category.name;
        categorySelect.appendChild(option);
      });
    }

    function renderTable(products) {
      body.innerHTML = "";

      if (!products.length) {
        body.innerHTML = `<tr><td colspan="8" class="px-6 py-8 text-center text-slate-400 italic">Tidak ada data barang.</td></tr>`;
        return;
      }

      products.forEach((product) => {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0";
        
        const statusClass = product.is_active 
            ? "bg-emerald-100 text-emerald-700 border border-emerald-200" 
            : "bg-slate-100 text-slate-600 border border-slate-200";
        const statusLabel = product.is_active ? "Aktif" : "Nonaktif";
        const toggleLabel = product.is_active ? "Nonaktifkan" : "Aktifkan";
        const toggleClass = product.is_active ? "text-red-500 hover:text-red-700 hover:bg-red-50" : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50";

        tr.innerHTML = `
          <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">${escapeHtml(product.no_sku || "-")}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-800">${escapeHtml(product.name)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">${escapeHtml(product.barcode || "-")}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600"><span class="px-2 py-1 bg-slate-100 rounded-md text-xs font-semibold">${escapeHtml(product.category_name || "-")}</span></td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-700">${formatRupiah(product.selling_price)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600 uppercase tracking-widest text-xs font-bold">${escapeHtml(product.unit || "-")}</td>
          <td class="px-6 py-4 whitespace-nowrap"><span class="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${statusClass}">${statusLabel}</span></td>
          <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
            <div class="flex items-center justify-end gap-2">
              <button type="button" data-edit="${escapeHtml(product.id)}" class="px-3 py-1.5 rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors flex items-center justify-center font-bold">Edit</button>
              <button type="button" data-toggle="${escapeHtml(product.id)}" class="px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center font-bold ${toggleClass}">
                ${toggleLabel}
              </button>
            </div>
          </td>
        `;

        body.appendChild(tr);
      });
    }

    function renderProducts() {
      renderTable(getFilteredProducts());
      setBusy(state.isBusy);
    }

    function resetForm() {
      nameInput.value = "";
      barcodeInput.value = "";
      categorySelect.value = "";
      priceInput.value = "";
      unitSelect.value = "pcs";
      minStockInput.value = "";
      weighedCheckbox.checked = false;
    }

    function openModal(product = null) {
      modal.classList.add("active");

      if (product) {
        modalTitle.textContent = "Edit Barang";
        saveBtn.textContent = "Simpan Perubahan";
        state.editingId = product.id;

        nameInput.value = product.name || "";
        barcodeInput.value = product.barcode || "";
        categorySelect.value = product.category_id || "";
        priceInput.value = product.selling_price || "";
        unitSelect.value = product.unit || "pcs";
        minStockInput.value = product.min_stock ?? 5;
        weighedCheckbox.checked = Boolean(product.is_non_barcode);
        return;
      }

      modalTitle.textContent = "Tambah Barang";
      saveBtn.textContent = "Simpan Barang";
      state.editingId = null;
      resetForm();
    }

    function closeModal() {
      modal.classList.remove("active");
      state.editingId = null;
      resetForm();
    }

    function closeConfirmModal(result = false) {
      confirmModal.classList.remove("active");

      if (state.confirmResolver) {
        state.confirmResolver(result);
        state.confirmResolver = null;
      }
    }

    function askToggleConfirmation(productName, nextStatusLabel) {
      if (state.confirmResolver) {
        closeConfirmModal(false);
      }

      confirmText.textContent = `Ubah status "${productName}" menjadi ${nextStatusLabel}?`;
      confirmModal.classList.add("active");

      return new Promise((resolve) => {
        state.confirmResolver = resolve;
      });
    }

    function setBusy(isBusy) {
      state.isBusy = isBusy;

      searchInput.disabled = isBusy;
      btnAdd.disabled = isBusy;
      saveBtn.disabled = isBusy;
      cancelBtn.disabled = isBusy;
      confirmToggleBtn.disabled = isBusy;
      cancelToggleBtn.disabled = isBusy;

      body.querySelectorAll("button").forEach((button) => {
        button.disabled = isBusy;
      });
    }

    async function loadCategories() {
      const categories = await window.api.getProductCategories();
      if (signal.aborted) return;

      state.categories = Array.isArray(categories) ? categories : [];
      renderCategories();
    }

    async function loadProducts() {
      const products = await window.api.getProducts();
      if (signal.aborted) return;

      state.allProducts = Array.isArray(products) ? products : [];
      renderProducts();
    }

    function validateForm() {
      const sellingPrice = Number(priceInput.value);
      const payload = {
        name: nameInput.value.trim(),
        barcode: barcodeInput.value.trim() || null,
        category_id: categorySelect.value || null,
        selling_price: sellingPrice,
        unit: unitSelect.value,
        min_stock: minStockInput.value !== "" ? parseInt(minStockInput.value, 10) : 5,
        is_non_barcode: weighedCheckbox.checked,
      };

      if (!payload.name) {
        showMessage("error", "Nama barang wajib diisi.", true);
        return null;
      }

      if (!Number.isFinite(payload.selling_price) || payload.selling_price <= 0) {
        showMessage("error", "Harga jual harus lebih besar dari 0.", true);
        return null;
      }

      return payload;
    }

    async function saveProduct() {
      const payload = validateForm();
      if (!payload) return;

      setBusy(true);

      try {
        if (state.editingId) {
          await window.api.updateProduct(state.editingId, payload);
          if (signal.aborted) return;
          showMessage("success", "Perubahan barang berhasil disimpan.");
        } else {
          await window.api.createProduct(payload);
          if (signal.aborted) return;
          showMessage("success", "Barang baru berhasil ditambahkan.");
        }

        closeModal();
        await loadProducts();
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

    async function handleToggleActive(productId) {
      const product = state.allProducts.find((item) => item.id === productId);
      if (!product) return;

      const nextStatusLabel = product.is_active ? "nonaktif" : "aktif";
      const confirmed = await askToggleConfirmation(product.name, nextStatusLabel);
      if (!confirmed) return;

      setBusy(true);

      try {
        const result = await window.api.toggleProductActive(productId);
        if (signal.aborted) return;

        const index = state.allProducts.findIndex((item) => item.id === productId);
        if (index >= 0) {
          if (result && typeof result.is_active !== "undefined") {
            state.allProducts[index].is_active = result.is_active;
          } else {
            state.allProducts[index].is_active = state.allProducts[index].is_active
              ? 0
              : 1;
          }
        }

        renderProducts();
        showMessage("success", "Status barang berhasil diperbarui.");
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
        renderProducts();
      },
      { signal },
    );

    btnAdd.addEventListener(
      "click",
      () => {
        openModal();
      },
      { signal },
    );

    const btnExportProducts = document.getElementById("btn-export-products");
    if (btnExportProducts) {
      btnExportProducts.addEventListener(
        "click",
        async () => {
          btnExportProducts.disabled = true;
          try {
            const result = await window.api.exportProducts();
            if (signal.aborted) return;

            if (result && result.success) {
              showMessage("success", result.message);
            } else if (result) {
              showMessage("error", result.message || "Export dibatalkan.");
            }
          } catch (error) {
            if (!signal.aborted) {
              showMessage("error", error.message, true);
            }
          } finally {
            if (!signal.aborted) btnExportProducts.disabled = false;
          }
        },
        { signal },
      );
    }

    const importModal = document.getElementById("import-modal");
    const btnOpenImport = document.getElementById("btn-open-import");
    const btnCloseImport = document.getElementById("close-import-modal");
    const btnDownloadTemplate = document.getElementById("btn-download-template");
    const btnImportExcel = document.getElementById("btn-import-excel");

    function openImportModal() {
      if (importModal) importModal.classList.add("active");
    }

    function closeImportModal() {
      if (importModal) importModal.classList.remove("active");
    }

    if (btnOpenImport) {
      btnOpenImport.addEventListener("click", () => openImportModal(), { signal });
    }

    if (btnCloseImport) {
      btnCloseImport.addEventListener("click", () => closeImportModal(), { signal });
    }

    if (importModal) {
      importModal.addEventListener(
        "click",
        (event) => {
          if (event.target === importModal) closeImportModal();
        },
        { signal },
      );
    }

    if (btnDownloadTemplate) {
      btnDownloadTemplate.addEventListener(
        "click",
        async () => {
          btnDownloadTemplate.disabled = true;
          try {
            const result = await window.api.downloadImportTemplate();
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
            if (!signal.aborted) btnDownloadTemplate.disabled = false;
          }
        },
        { signal },
      );
    }

    if (btnImportExcel) {
      btnImportExcel.addEventListener(
        "click",
        async () => {
          setBusy(true);
          try {
            const result = await window.api.importProducts();
            if (signal.aborted) return;

            if (result && result.success) {
              closeImportModal();
              showMessage("success", result.message);

              if (result.errors && result.errors.length > 0) {
                console.warn("[Import] Peringatan:", result.errors);
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

    body.addEventListener(
      "click",
      (event) => {
        const editButton = event.target.closest("button[data-edit]");
        if (editButton) {
          const productId = editButton.dataset.edit;
          const product = state.allProducts.find((item) => item.id === productId);
          if (product) {
            openModal(product);
          }
          return;
        }

        const toggleButton = event.target.closest("button[data-toggle]");
        if (toggleButton) {
          handleToggleActive(toggleButton.dataset.toggle).catch((error) => {
            if (!signal.aborted) {
              showMessage("error", error.message, true);
            }
          });
        }
      },
      { signal },
    );

    saveBtn.addEventListener(
      "click",
      () => {
        saveProduct().catch((error) => {
          if (!signal.aborted) {
            showMessage("error", error.message, true);
          }
        });
      },
      { signal },
    );

    cancelBtn.addEventListener(
      "click",
      () => {
        closeModal();
      },
      { signal },
    );

    confirmToggleBtn.addEventListener(
      "click",
      () => {
        closeConfirmModal(true);
      },
      { signal },
    );

    cancelToggleBtn.addEventListener(
      "click",
      () => {
        closeConfirmModal(false);
      },
      { signal },
    );

    modal.addEventListener(
      "click",
      (event) => {
        if (event.target === modal) {
          closeModal();
        }
      },
      { signal },
    );

    confirmModal.addEventListener(
      "click",
      (event) => {
        if (event.target === confirmModal) {
          closeConfirmModal(false);
        }
      },
      { signal },
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape") return;

        if (importModal && importModal.classList.contains("active")) {
          closeImportModal();
          return;
        }

        if (confirmModal.classList.contains("active")) {
          closeConfirmModal(false);
          return;
        }

        if (modal.classList.contains("active")) {
          closeModal();
        }
      },
      { signal },
    );

    Promise.all([loadCategories(), loadProducts()]).catch((error) => {
      if (!signal.aborted) {
        showMessage("error", error.message, true);
      }
    });

    return () => {
      eventController.abort();
      closeModal();
      closeConfirmModal(false);
      closeImportModal();

      if (state.feedbackTimerId) {
        clearTimeout(state.feedbackTimerId);
      }
    };
  }

  window.pageModules = window.pageModules || {};
  window.pageModules.products = { init: initProducts };
})();
