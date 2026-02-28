(() => {
  function initDashboard() {
    const dateInput = document.getElementById("dashboard-date");
    const cardTransactions = document.getElementById("card-transactions");
    const cardRevenue = document.getElementById("card-revenue");
    const cardProfit = document.getElementById("card-profit");
    const topProductsBody = document.getElementById("top-products-body");
    const lowStockBody = document.getElementById("low-stock-body");
    const dashboardRoot = document.querySelector(".dashboard");

    if (
      !dateInput ||
      !cardTransactions ||
      !cardRevenue ||
      !cardProfit ||
      !topProductsBody
    ) {
      console.error("[Dashboard] elemen wajib tidak ditemukan.");
      return () => {};
    }

    const eventController = new AbortController();
    const { signal } = eventController;

    const charts = {
      transactions: null,
      revenue: null,
      profit: null,
    };

    let resizeFrameId = null;
    const resizeObserver =
      typeof ResizeObserver === "function" && dashboardRoot
        ? new ResizeObserver(() => queueResize())
        : null;

    function formatRupiah(num) {
      return `Rp ${Number(num || 0).toLocaleString("id-ID")}`;
    }

    function formatDateDisplay(date) {
      if (!date) return '';
      const d = date.getDate().toString().padStart(2, '0');
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      const y = date.getFullYear();
      return `${d}-${m}-${y}`;
    }

    function formatDateISO(date) {
      if (!date) return '';
      const y = date.getFullYear();
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      const d = date.getDate().toString().padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // Current selected date in ISO format for backend
    let currentDateISO = formatDateISO(new Date());

    const dashboardPicker = new SingleDatePicker({
      initialDate: new Date(),
      onApply: (selectedDate) => {
        dateInput.value = formatDateDisplay(selectedDate);
        currentDateISO = formatDateISO(selectedDate);
        loadDashboard(currentDateISO).catch((error) => {
          if (!signal.aborted) {
            console.error("[Dashboard] gagal memuat data:", error);
          }
        });
      }
    });

    dateInput.addEventListener('click', () => dashboardPicker.show(), { signal });

    function destroyCharts() {
      Object.keys(charts).forEach((key) => {
        if (charts[key]) {
          charts[key].destroy();
          charts[key] = null;
        }
      });
    }

    function resizeChart(chart) {
      if (!chart) return;
      const canvas = chart.canvas;
      if (!canvas || !canvas.isConnected) return;

      const container = canvas.parentElement;
      if (!container || !container.isConnected) return;

      const rect = container.getBoundingClientRect();
      const width = Math.max(120, Math.floor(rect.width));
      const height = Math.max(140, Math.floor(rect.height));

      try {
        chart.resize(width, height);
      } catch (error) {
        console.warn("[Dashboard] resize chart dilewati:", error);
      }
    }

    function queueResize() {
      if (resizeFrameId) {
        cancelAnimationFrame(resizeFrameId);
      }

      resizeFrameId = requestAnimationFrame(() => {
        Object.values(charts).forEach((chart) => {
          resizeChart(chart);
        });
      });
    }

    function renderChart(id, labels, data, color) {
      if (typeof Chart === "undefined") {
        console.error("[Dashboard] Chart.js tidak tersedia.");
        return null;
      }

      const canvas = document.getElementById(id);
      if (!canvas) return null;
      if (!canvas.isConnected) return null;

      const existingChart = Chart.getChart(canvas);
      if (existingChart) {
        existingChart.destroy();
      }

      const context = canvas.getContext("2d");
      if (!context) {
        console.error(`[Dashboard] context canvas "${id}" tidak tersedia.`);
        return null;
      }

      return new Chart(context, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              data,
              borderColor: color,
              backgroundColor: `${color}33`,
              tension: 0.3,
              fill: true,
              pointRadius: 3,
            },
          ],
        },
        options: {
          responsive: false,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            y: { beginAtZero: true },
          },
        },
      });
    }

    async function loadTopProducts(date) {
      const products = await window.api.getDashboardTopProducts(date, 5);
      if (signal.aborted) return;

      topProductsBody.innerHTML = "";

      if (!products.length) {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td colspan="2" class="px-6 py-8 text-center text-slate-400 italic">
            Tidak ada data pada tanggal ini.
          </td>
        `;
        topProductsBody.appendChild(row);
        return;
      }

      products.forEach((product) => {
        const row = document.createElement("tr");
        row.className = "hover:bg-slate-50 transition-colors";
        row.innerHTML = `
          <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-medium">${product.product_name}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-700 text-right font-bold">${product.total_qty}</td>
        `;
        topProductsBody.appendChild(row);
      });
    }

    async function loadLowStockProducts() {
      if (!lowStockBody) return;

      const products = await window.api.getLowStockProducts();
      if (signal.aborted) return;

      lowStockBody.innerHTML = "";

      if (!products.length) {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td colspan="3" class="px-6 py-8 text-center text-emerald-500 italic">
            ✅ Semua stok aman.
          </td>
        `;
        lowStockBody.appendChild(row);
        return;
      }

      products.forEach((product) => {
        const row = document.createElement("tr");
        const isZero = product.total_stock === 0;
        row.className = `hover:bg-slate-50 transition-colors ${isZero ? "bg-red-50" : ""}`;
        row.innerHTML = `
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium ${isZero ? "text-red-700" : "text-slate-700"}">${product.product_name}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${isZero ? "text-red-600" : "text-orange-600"}">${product.total_stock}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-500">${product.min_stock}</td>
        `;
        lowStockBody.appendChild(row);
      });
    }

    async function loadDashboard(date) {
      const summary = await window.api.getDashboardSummary(date);
      if (signal.aborted) return;

      cardTransactions.textContent = String(summary.totalTransactions || 0);
      cardRevenue.textContent = formatRupiah(summary.totalRevenue);
      cardProfit.textContent = formatRupiah(summary.totalProfit);

      const hourly = await window.api.getDashboardHourly(date);
      if (signal.aborted) return;

      const labels = hourly.map((item) => item.hour);
      const txData = hourly.map((item) => item.transactions);
      const revData = hourly.map((item) => item.revenue);
      const profitData = hourly.map((item) => item.profit);

      destroyCharts();

      charts.transactions = renderChart(
        "chart-transactions",
        labels,
        txData,
        "#1976d2",
      );
      charts.revenue = renderChart("chart-revenue", labels, revData, "#43a047");
      charts.profit = renderChart("chart-profit", labels, profitData, "#fb8c00");

      queueResize();
      await loadTopProducts(date);
      await loadLowStockProducts();
    }

    window.addEventListener("resize", queueResize, { signal });
    if (resizeObserver && dashboardRoot) {
      resizeObserver.observe(dashboardRoot);
    }

    // Set initial display value & load
    dateInput.value = formatDateDisplay(new Date());
    loadDashboard(currentDateISO).catch((error) => {
      if (!signal.aborted) {
        console.error("[Dashboard] gagal memuat data awal:", error);
      }
    });

    return () => {
      eventController.abort();
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (resizeFrameId) {
        cancelAnimationFrame(resizeFrameId);
      }
      destroyCharts();
    };
  }

  window.pageModules = window.pageModules || {};
  window.pageModules.dashboard = { init: initDashboard };
})();
