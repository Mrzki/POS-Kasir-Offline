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
    const nameStrukInput = document.getElementById("product-name-struk");
    const barcodeInput = document.getElementById("product-barcode");
    const categorySelect = document.getElementById("product-category");
    const priceInput = document.getElementById("product-price");
    const unitSelect = document.getElementById("product-unit");
    const minStockInput = document.getElementById("product-min-stock");
    const weighedCheckbox = document.getElementById("product-weighed");

    const saveBtn = document.getElementById("save-product");
    const cancelBtn = document.getElementById("cancel-product");

    // Dynamic packages elements
    const packagesContainer = document.getElementById("packages-container");
    const btnAddPackage = document.getElementById("btn-add-package");

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
      !nameStrukInput ||
      !barcodeInput ||
      !categorySelect ||
      !priceInput ||
      !unitSelect ||
      !minStockInput ||
      !weighedCheckbox ||
      !saveBtn ||
      !cancelBtn ||
      !packagesContainer ||
      !btnAddPackage
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
      searchTimerId: null,
      searchVersion: 0,
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

    async function performSearch(keyword) {
      const version = ++state.searchVersion;

      try {
        let results;
        if (!keyword) {
          results = state.allProducts;
        } else {
          results = await window.api.searchProducts(keyword);
          if (signal.aborted || version !== state.searchVersion) return;
        }

        renderTable(results);
        setBusy(state.isBusy);
      } catch (error) {
        if (!signal.aborted && version === state.searchVersion) {
          console.error("[Products] search error:", error);
        }
      }
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

    /* ===============================
       BUILD PRICE DISPLAY STRING
       Menggabungkan harga satuan dasar + harga kemasan
       Contoh: "1 Botol: Rp3.000 | 1 Kardus: Rp65.000"
    ================================= */
    function buildPriceDisplay(product) {
      const unit = product.unit || "pcs";
      const parts = [`1 ${escapeHtml(unit)}: ${formatRupiah(product.selling_price)}`];

      if (Array.isArray(product.packages)) {
        for (const pkg of product.packages) {
          parts.push(`1 ${escapeHtml(pkg.package_name)} (${pkg.conversion_qty} ${escapeHtml(unit)}): ${formatRupiah(pkg.price)}`);
        }
      }

      return parts;
    }

    function renderTable(products) {
      body.innerHTML = "";

      if (!products.length) {
        body.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-slate-400 italic">Tidak ada data barang.</td></tr>`;
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
        const toggleClass = product.is_active 
            ? "bg-red-50 text-red-700 hover:bg-red-100 focus:ring-red-500" 
            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 focus:ring-emerald-500";

        // Build price display (unit + packages)
        const priceParts = buildPriceDisplay(product);
        const priceHtml = priceParts
          .map((part, i) => {
            if (i === 0) return `<div class="font-bold text-slate-700 text-sm">${part}</div>`;
            return `<div class="text-xs text-blue-600 mt-0.5">${part}</div>`;
          })
          .join("");

        tr.innerHTML = `
          <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">${escapeHtml(product.no_sku || "-")}</td>
          <td class="px-6 py-4">
            <div class="font-bold text-slate-800 text-sm">${escapeHtml(product.name)}</div>
            <div class="text-xs text-slate-500 mt-0.5">${escapeHtml(product.name_struk || product.name)}</div>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">${escapeHtml(product.barcode || "-")}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600"><span class="px-2 py-1 bg-slate-100 rounded-md text-xs font-semibold">${escapeHtml(product.category_name || "-")}</span></td>
          <td class="px-6 py-4 text-sm">${priceHtml}</td>
          <td class="px-6 py-4 whitespace-nowrap"><span class="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${statusClass}">${statusLabel}</span></td>
          <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
            <div class="flex items-center justify-end gap-2">
              <button type="button" data-edit="${escapeHtml(product.id)}" class="inline-flex items-center justify-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500">Edit</button>
              <button type="button" data-toggle="${escapeHtml(product.id)}" class="inline-flex items-center justify-center px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 ${toggleClass}">
                ${toggleLabel}
              </button>
            </div>
          </td>
        `;

        body.appendChild(tr);
      });
    }

    function renderProducts() {
      renderTable(state.allProducts);
      setBusy(state.isBusy);
    }

    /* ===============================
       DYNAMIC PACKAGES FORM LOGIC
    ================================= */

    function addPackageRow(pkg = null) {
      const row = document.createElement("div");
      row.className = "package-row flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl";

      row.innerHTML = `
        <input type="text" placeholder="Nama (cth: Dus)" value="${escapeHtml(pkg?.package_name || "")}"
          class="pkg-name flex-1 min-w-0 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all placeholder:font-medium placeholder:text-slate-400" />
        <input type="number" placeholder="Isi" min="1" value="${pkg?.conversion_qty || ""}"
          class="pkg-qty w-20 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all placeholder:font-medium placeholder:text-slate-400 text-center" />
        <input type="number" placeholder="Harga" min="0" value="${pkg?.price || ""}"
          class="pkg-price w-28 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all placeholder:font-medium placeholder:text-slate-400" />
        <button type="button" class="btn-remove-package w-8 h-8 flex-none flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Hapus kemasan">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="pointer-events-none"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      `;

      packagesContainer.appendChild(row);
    }

    function removePackageRow(row) {
      row.remove();
    }

    function clearPackages() {
      packagesContainer.innerHTML = "";
    }

    function populatePackages(packages) {
      clearPackages();
      if (!Array.isArray(packages)) return;
      for (const pkg of packages) {
        addPackageRow(pkg);
      }
    }

    function getPackagesFromForm() {
      const rows = packagesContainer.querySelectorAll(".package-row");
      const packages = [];

      rows.forEach((row) => {
        const name = row.querySelector(".pkg-name")?.value?.trim() || "";
        const qty = parseInt(row.querySelector(".pkg-qty")?.value, 10);
        const price = parseInt(row.querySelector(".pkg-price")?.value, 10);

        // Hanya masukkan baris yang ada isinya
        if (name && qty > 0 && price > 0) {
          packages.push({
            package_name: name,
            conversion_qty: qty,
            price: price,
          });
        }
      });

      return packages;
    }

    /* ===============================
       MODAL OPEN / CLOSE / RESET
    ================================= */

    function resetForm() {
      nameInput.value = "";
      nameStrukInput.value = "";
      barcodeInput.value = "";
      categorySelect.value = "";
      priceInput.value = "";
      unitSelect.value = "pcs";
      minStockInput.value = "";
      weighedCheckbox.checked = false;
      clearPackages();
    }

    function openModal(product = null) {
      modal.classList.add("active");

      if (product) {
        modalTitle.textContent = "Edit Barang";
        saveBtn.textContent = "Simpan Perubahan";
        state.editingId = product.id;

        nameInput.value = product.name || "";
        nameStrukInput.value = product.name_struk || "";
        barcodeInput.value = product.barcode || "";
        categorySelect.value = product.category_id || "";
        priceInput.value = product.selling_price || "";
        unitSelect.value = product.unit || "pcs";
        minStockInput.value = product.min_stock ?? 5;
        weighedCheckbox.checked = Boolean(product.is_non_barcode);

        // Populate kemasan dari data product
        populatePackages(product.packages);
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
      const packages = getPackagesFromForm();

      const payload = {
        name: nameInput.value.trim(),
        name_struk: nameStrukInput.value.trim() || null,
        barcode: barcodeInput.value.trim() || null,
        category_id: categorySelect.value || null,
        selling_price: sellingPrice,
        unit: unitSelect.value,
        min_stock: minStockInput.value !== "" ? parseInt(minStockInput.value, 10) : 5,
        is_non_barcode: weighedCheckbox.checked,
        packages: packages,
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
          const msg = (error.message || "Gagal menyimpan barang.").replace(/^Error invoking remote method '[^']+': Error: /i, "");
          showMessage("error", msg);
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

    /* ===============================
       EVENT LISTENERS
    ================================= */

    searchInput.addEventListener(
      "input",
      () => {
        state.keyword = (searchInput.value || "").trim();

        if (state.searchTimerId) {
          clearTimeout(state.searchTimerId);
        }

        state.searchTimerId = setTimeout(() => {
          state.searchTimerId = null;
          performSearch(state.keyword);
        }, 300);
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

    // Dynamic packages: tambah baris
    btnAddPackage.addEventListener(
      "click",
      () => {
        addPackageRow();
      },
      { signal },
    );

    // Dynamic packages: hapus baris (delegated)
    packagesContainer.addEventListener(
      "click",
      (event) => {
        const removeBtn = event.target.closest(".btn-remove-package");
        if (!removeBtn) return;
        const row = removeBtn.closest(".package-row");
        if (row) removePackageRow(row);
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
                      result.errors.join(" | "),
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
