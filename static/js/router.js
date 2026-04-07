function setActiveRoute(route) {
    const navRoute = route === "product-detail"
        ? "products"
        : (route === "store-detail" ? "stores" : route);
    document.querySelectorAll(".nav-link").forEach((link) => {
        link.classList.toggle("active", link.dataset.route === navRoute);
    });
    document.querySelectorAll(".view").forEach((view) => {
        view.classList.toggle("active-view", view.id === `view-${route}`);
    });
}

function readRouteFromHash() {
    const route = location.hash.replace("#", "") || "home";
    return ["home", "products", "product-detail", "stores", "store-detail", "store-map", "employees"].includes(route)
        ? route
        : "home";
}

function setupThemeToggle() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;

    const initial = localStorage.getItem("theme") || "light";
    document.body.dataset.theme = initial;
    if (window.appI18n) {
        window.appI18n.applyTranslations();
    }

    btn.addEventListener("click", () => {
        const current = document.body.dataset.theme || "light";
        const next = current === "light" ? "dark" : "light";
        document.body.dataset.theme = next;
        localStorage.setItem("theme", next);
        if (window.appI18n) {
            window.appI18n.applyTranslations();
        }
    });
}

function setupLanguageToggle() {
    const btn = document.getElementById("language-toggle");
    if (!btn || !window.appI18n) return;

    window.appI18n.applyTranslations();
    btn.addEventListener("click", () => {
        window.appI18n.toggleLanguage();
    });
}

function buildHomeUmlDefinition(lang) {
        if (lang === "en") {
                return `classDiagram
        Store "1" -- "1..*" Employee : employs
        Store "1" -- "4..*" Shelf : contains
        Product "1" -- "1..*" InventoryItem : referenced
        Shelf "1" -- "1..*" InventoryItem : contains
        Store "1" -- "1..*" InventoryItem : manages

        class Store {
            +name
            +url
            +telephone
            +countryCode
            +capacity
            +description
            +temperature
            +relativeHumidity
        }

        class Product {
            +name
            +color
            +size
            +price
        }

        class Employee {
            +name
            +email
            +dateOfContract
            +category
            +skills[]
            +username
            +password
            +refStore
        }

        class InventoryItem {
            +refStore
            +refShelf
            +refProduct
            +stockCount
            +shelfCount
        }`;
        }

        return `classDiagram
        Store "1" -- "1..*" Employee : emplea
        Store "1" -- "4..*" Shelf : contiene
        Product "1" -- "1..*" InventoryItem : referenciado
        Shelf "1" -- "1..*" InventoryItem : contiene
        Store "1" -- "1..*" InventoryItem : gestiona

        class Store {
            +nombre
            +url
            +telefono
            +codigoPais
            +capacidad
            +descripcion
            +temperatura
            +humedadRelativa
        }

        class Product {
            +nombre
            +color
            +talla
            +precio
        }

        class Employee {
            +nombre
            +email
            +fechaContrato
            +categoria
            +habilidades[]
            +usuario
            +contrasena
            +refStore
        }

        class InventoryItem {
            +refStore
            +refShelf
            +refProduct
            +stockCount
            +shelfCount
        }`;
}

async function renderHomeUmlDiagram() {
        const container = document.getElementById("uml-mermaid");
        if (!container || typeof mermaid === "undefined") return;

        const lang = window.appI18n ? window.appI18n.getLanguage() : "es";
        const definition = buildHomeUmlDefinition(lang);

        try {
                const graphId = `uml-${lang}-${Date.now()}`;
                const result = await mermaid.render(graphId, definition);
                container.innerHTML = result.svg;
        } catch (err) {
                container.textContent = "No se pudo renderizar el diagrama UML.";
        }
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
    mermaid.initialize({ startOnLoad: false, theme: "default" });
    setupLanguageToggle();
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
    renderHomeUmlDiagram();

    document.addEventListener("app:language-changed", () => {
        renderHomeUmlDiagram();
    });
});
