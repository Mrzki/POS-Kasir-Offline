const appContainer = document.getElementById("app");

const hamburger = document.getElementById("hamburger");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
const closeSidebar = document.getElementById("close-sidebar");

const PAGE_CONFIG = {
  dashboard: {
    html: "pages/dashboard.html",
    script: "pages/dashboard.js",
  },
  kasir: {
    html: "pages/kasir.html",
    script: "pages/kasir.js",
  },
  products: {
    html: "pages/products.html",
    script: "pages/products.js",
  },
  stocks: {
    html: "pages/stock.html",
    script: "pages/stock.js",
  },
  transactions: {
    html: "pages/transactions.html",
    script: "pages/transactions.js",
  },
  sales: {
    html: "pages/sales.html",
    script: "pages/sales.js",
  },
};

const pageScriptCache = new Map();
let currentPageCleanup = null;
let currentLoadToken = 0;

function openSidebar() {
  sidebar.classList.add("active");
  overlay.classList.add("active");
}

function closeSidebarFn() {
  sidebar.classList.remove("active");
  overlay.classList.remove("active");
}

hamburger.addEventListener("click", openSidebar);
closeSidebar.addEventListener("click", closeSidebarFn);
overlay.addEventListener("click", closeSidebarFn);

document.querySelectorAll(".sidebar-menu li[data-page]").forEach((item) => {
  item.addEventListener("click", () => {
    const page = item.dataset.page;
    closeSidebarFn();
    loadPage(page);
  });
});

document.querySelectorAll(".submenu-header").forEach((header) => {
  header.addEventListener("click", () => {
    const submenu = header.parentElement;
    submenu.classList.toggle("open");
  });
});

function setActiveMenu(page) {
  document.querySelectorAll(".sidebar-menu li[data-page]").forEach((item) => {
    const isActive = item.dataset.page === page;
    item.classList.toggle("active", isActive);
    
    if (isActive && item.classList.contains("submenu-item")) {
      const submenu = item.closest(".submenu");
      if (submenu) {
        submenu.classList.add("open");
      }
    }
  });
}

async function ensurePageScript(scriptPath) {
  if (pageScriptCache.has(scriptPath)) {
    return pageScriptCache.get(scriptPath);
  }

  const loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = scriptPath;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error(`Gagal memuat script: ${scriptPath}`));
    document.body.appendChild(script);
  });

  pageScriptCache.set(scriptPath, loadPromise);

  try {
    await loadPromise;
  } catch (error) {
    pageScriptCache.delete(scriptPath);
    throw error;
  }
}

function cleanupCurrentPage() {
  if (!currentPageCleanup) return;

  try {
    currentPageCleanup();
  } catch (error) {
    console.error("[SPA] cleanup gagal:", error);
  } finally {
    currentPageCleanup = null;
  }
}

function renderPlaceholder(page) {
  appContainer.innerHTML = `
    <div class="page-placeholder">
      <h2>Halaman "${page}" belum tersedia</h2>
      <p>Fitur ini belum dibuat di build saat ini.</p>
    </div>
  `;
}

function renderPageError(page) {
  appContainer.innerHTML = `
    <div class="page-error">
      <h2>Gagal memuat halaman "${page}"</h2>
      <p>Periksa console untuk detail error.</p>
    </div>
  `;
}

async function loadPage(page) {
  const pageConfig = PAGE_CONFIG[page];
  setActiveMenu(page);

  if (!pageConfig) {
    cleanupCurrentPage();
    renderPlaceholder(page);
    return;
  }

  const loadToken = ++currentLoadToken;

  try {
    cleanupCurrentPage();

    const response = await fetch(pageConfig.html);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} (${pageConfig.html})`);
    }

    const html = await response.text();
    if (loadToken !== currentLoadToken) return;

    appContainer.innerHTML = html;

    await ensurePageScript(pageConfig.script);
    if (loadToken !== currentLoadToken) return;

    const pageModule = window.pageModules?.[page];
    if (!pageModule || typeof pageModule.init !== "function") {
      throw new Error(`pageModules.${page}.init tidak ditemukan`);
    }

    const cleanup = pageModule.init({ container: appContainer });
    currentPageCleanup = typeof cleanup === "function" ? cleanup : null;
  } catch (error) {
    if (loadToken !== currentLoadToken) return;
    console.error(`[SPA] gagal load halaman "${page}"`, error);
    renderPageError(page);
  }
}

loadPage("kasir");
