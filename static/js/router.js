function setActiveRoute(route) {
    const navRoute = route === "product-detail" ? "products" : (route === "store-detail" ? "stores" : route);
    document.querySelectorAll(".nav-link").forEach((link) => {
        link.classList.toggle("active", link.dataset.route === navRoute);
    });
    document.querySelectorAll(".view").forEach((view) => {
        view.classList.toggle("active-view", view.id === `view-${route}`);
    });
}

function readRouteFromHash() {
    const route = location.hash.replace("#", "") || "home";
    return ["home", "products", "product-detail", "stores", "store-detail", "employees"].includes(route)
        ? route
        : "home";
}

function setupThemeToggle() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;

    const initial = localStorage.getItem("theme") || "light";
    document.body.dataset.theme = initial;

    btn.addEventListener("click", () => {
        const current = document.body.dataset.theme || "light";
        const next = current === "light" ? "dark" : "light";
        document.body.dataset.theme = next;
        localStorage.setItem("theme", next);
    });
}

async function loadSummaryKpis() {
    try {
        const payload = await window.appApi.api.get("/api/summary");
        const data = payload.data || {};
        document.getElementById("kpi-products").textContent = data.product || 0;
        document.getElementById("kpi-employees").textContent = data.employee || 0;
        document.getElementById("kpi-stores").textContent = data.store || 0;
        document.getElementById("kpi-inventoryitem").textContent = data.inventoryitem || 0;
    } catch (err) {
        window.appApi.showAlert("No se pudieron cargar los KPIs.");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    mermaid.initialize({ startOnLoad: true, theme: "default" });
    setupThemeToggle();

    const applyRoute = () => setActiveRoute(readRouteFromHash());
    window.addEventListener("hashchange", applyRoute);
    applyRoute();

    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
        btn.addEventListener("click", () => {
            window.appApi.closeDialogById(btn.dataset.closeModal);
        });
    });

    loadSummaryKpis();
});
