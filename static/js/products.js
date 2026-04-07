const productsState = {
    items: [],
    editingId: null,
    selectedProductId: null,
    groupedInventory: null,
};

function t(key, params) {
    return window.appI18n ? window.appI18n.t(key, params) : key;
}

function filterProducts(list, term) {
    if (!term) return list;
    const query = term.toLowerCase();
    return list.filter((item) => String(item.name || "").toLowerCase().includes(query));
}

function colorSwatch(hex) {
    const value = hex || "#000000";
    return `<span class="swatch" style="background:${value}"></span> ${value}`;
}

function displayProductName(name) {
    return window.appI18n ? window.appI18n.translateDomainValue("productName", name) : name;
}

function displayShelfName(name) {
    return window.appI18n ? window.appI18n.translateDomainValue("shelfName", name) : name;
}

function renderProducts() {
    const tbody = document.getElementById("products-tbody");
    const empty = document.getElementById("products-empty");
    const term = document.getElementById("products-search").value.trim();
    const rows = filterProducts(productsState.items, term);

    tbody.innerHTML = rows
        .map((p) => {
            const image = p.image ? `<img src="${p.image}" class="thumb" alt="${p.name}">` : "<span>-</span>";
            return `<tr>
                <td>${image}</td>
                <td>${displayProductName(p.name) || "-"}</td>
                <td>${colorSwatch(p.color)}</td>
                <td>${p.size || "-"}</td>
                <td>${p.price ?? "-"}</td>
                <td>
                    <button class="chip-btn" data-view-product="${p.id}">${t("actions.view")}</button>
                    <button class="chip-btn" data-edit-product="${p.id}">${t("actions.edit")}</button>
                    <button class="chip-btn danger" data-delete-product="${p.id}">${t("actions.delete")}</button>
                </td>
            </tr>`;
        })
        .join("");

    empty.style.display = rows.length ? "none" : "block";
}

async function loadProducts() {
    try {
        const payload = await window.appApi.api.get("/api/products");
        productsState.items = payload.data || [];
        renderProducts();
    } catch (err) {
        window.appApi.showAlert(err.message || t("alerts.loadProducts"));
    }
}

function openProductModal(editing = null) {
    const dialog = document.getElementById("product-modal");
    const form = document.getElementById("product-form");
    window.appApi.clearFieldErrors(form);

    if (editing) {
        productsState.editingId = editing.id;
        document.getElementById("product-form-title").textContent = t("productForm.editTitle");
        document.getElementById("product-id").value = editing.id;
        document.getElementById("product-name").value = editing.name || "";
        document.getElementById("product-color").value = editing.color || "#FF0000";
        document.getElementById("product-color-text").value = editing.color || "#FF0000";
        document.getElementById("product-size").value = editing.size || "";
        document.getElementById("product-price").value = editing.price ?? "";
        document.getElementById("product-image").value = editing.image || "";
    } else {
        productsState.editingId = null;
        document.getElementById("product-form-title").textContent = t("productForm.newTitle");
        form.reset();
        document.getElementById("product-color").value = "#FF0000";
        document.getElementById("product-color-text").value = "#FF0000";
    }

    dialog.showModal();
}

function collectProductPayload() {
    return {
        name: document.getElementById("product-name").value.trim(),
        color: document.getElementById("product-color-text").value.trim().toUpperCase(),
        size: document.getElementById("product-size").value,
        price: Number(document.getElementById("product-price").value),
        image: document.getElementById("product-image").value.trim(),
    };
}

function clientValidateProduct(payload, form) {
    let valid = true;
    window.appApi.clearFieldErrors(form);

    if (payload.name.length < 2) {
        window.appApi.setFieldError(form, "name", t("errors.min2"));
        valid = false;
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(payload.color)) {
        window.appApi.setFieldError(form, "color", t("errors.invalidColor"));
        valid = false;
    }
    if (!["XS", "S", "M", "L", "XL"].includes(payload.size)) {
        window.appApi.setFieldError(form, "size", t("errors.selectSize"));
        valid = false;
    }
    if (!Number.isInteger(payload.price) || payload.price < 1) {
        window.appApi.setFieldError(form, "price", t("errors.pricePositive"));
        valid = false;
    }
    return valid;
}

async function saveProduct(event) {
    event.preventDefault();
    const form = document.getElementById("product-form");
    const payload = collectProductPayload();
    if (!clientValidateProduct(payload, form)) return;

    try {
        if (productsState.editingId) {
            await window.appApi.api.patch(`/api/products/${encodeURIComponent(productsState.editingId)}`, payload);
            window.appApi.showAlert(t("success.productUpdated"), "success");
        } else {
            await window.appApi.api.post("/api/products", payload);
            window.appApi.showAlert(t("success.productCreated"), "success");
        }
        window.appApi.closeDialogById("product-modal");
        await loadProducts();
    } catch (err) {
        const details = err.details || {};
        if (details.fieldErrors) {
            Object.entries(details.fieldErrors).forEach(([k, v]) => window.appApi.setFieldError(form, k, v));
        }
        window.appApi.showAlert(err.message || t("errors.saveProduct"));
    }
}

async function deleteProductById(entityId) {
    if (!window.confirm(t("confirm.deleteProduct"))) return;
    try {
        await window.appApi.api.delete(`/api/products/${encodeURIComponent(entityId)}`);
        window.appApi.showAlert(t("success.productDeleted"), "success");
        await loadProducts();
    } catch (err) {
        window.appApi.showAlert(err.message || t("errors.deleteProduct"));
    }
}

function renderProductDetail() {
    const tbody = document.getElementById("product-detail-tbody");
    const empty = document.getElementById("product-detail-empty");
    const grouped = productsState.groupedInventory?.stores || [];

    const rows = [];
    grouped.forEach((group) => {
        rows.push(`<tr class="group-row">
            <td><strong>${group.storeName}</strong></td>
            <td><strong>${group.stockCount}</strong></td>
            <td>-</td>
            <td><button class="chip-btn" data-add-inventory-store="${group.storeId}" data-add-inventory-store-name="${group.storeName}">${t("actions.addInventoryItem")}</button></td>
        </tr>`);

        group.shelves.forEach((shelf) => {
            rows.push(`<tr class="child-row">
                <td>${displayShelfName(shelf.shelfName)}</td>
                <td>-</td>
                <td>${shelf.shelfCount}</td>
                <td></td>
            </tr>`);
        });
    });

    tbody.innerHTML = rows.join("");
    empty.style.display = rows.length ? "none" : "block";
}

async function loadProductDetail(productId) {
    try {
        const payload = await window.appApi.api.get(`/api/products/${encodeURIComponent(productId)}/inventory-grouped`);
        productsState.groupedInventory = payload.data || { stores: [] };
        renderProductDetail();
    } catch (err) {
        window.appApi.showAlert(err.message || t("errors.loadProductDetail"));
    }
}

function openProductDetail(productId) {
    const product = productsState.items.find((item) => item.id === productId);
    if (!product) return;

    productsState.selectedProductId = productId;
    document.getElementById("product-detail-title").textContent = `${t("productDetail.title")}: ${displayProductName(product.name)}`;
    window.location.hash = "#product-detail";
    loadProductDetail(productId);
}

async function openInventoryItemModal(storeId, storeName) {
    const productId = productsState.selectedProductId;
    if (!productId) return;

    const modal = document.getElementById("inventory-item-modal");
    const select = document.getElementById("inventory-shelf-select");
    const errorNode = document.getElementById("inventory-shelf-error");
    const submitBtn = document.getElementById("inventory-item-submit");
    errorNode.textContent = "";

    document.getElementById("inventory-product-id").value = productId;
    document.getElementById("inventory-store-id").value = storeId;
    document.getElementById("inventory-store-name").value = storeName;

    try {
        const payload = await window.appApi.api.get(
            `/api/products/${encodeURIComponent(productId)}/available-shelves?storeId=${encodeURIComponent(storeId)}`
        );
        const shelves = payload.data || [];

        if (!shelves.length) {
            select.innerHTML = `<option value="">${t("inventory.noAvailableShelves")}</option>`;
            submitBtn.disabled = true;
            errorNode.textContent = t("inventory.noShelvesForProduct");
        } else {
            select.innerHTML = shelves.map((shelf) => `<option value="${shelf.id}">${shelf.name}</option>`).join("");
            submitBtn.disabled = false;
        }

        modal.showModal();
    } catch (err) {
        window.appApi.showAlert(err.message || t("errors.loadAvailableShelves"));
    }
}

async function saveInventoryItem(event) {
    event.preventDefault();
    const productId = document.getElementById("inventory-product-id").value;
    const storeId = document.getElementById("inventory-store-id").value;
    const shelfId = document.getElementById("inventory-shelf-select").value;
    const shelfCount = Number(document.getElementById("inventory-shelf-count").value);
    const stockCount = Number(document.getElementById("inventory-stock-count").value);
    const errorNode = document.getElementById("inventory-shelf-error");
    errorNode.textContent = "";

    if (!shelfId) {
        errorNode.textContent = t("errors.selectShelf");
        return;
    }

    try {
        await window.appApi.api.post(`/api/products/${encodeURIComponent(productId)}/inventory-items`, {
            refStore: storeId,
            refShelf: shelfId,
            shelfCount: shelfCount,
            stockCount: stockCount,
        });
        window.appApi.closeDialogById("inventory-item-modal");
        window.appApi.showAlert(t("success.inventoryItemCreated"), "success");
        await loadProductDetail(productId);
    } catch (err) {
        errorNode.textContent = err.message || t("errors.createInventoryItem");
    }
}

function setupProductsEvents() {
    document.getElementById("btn-new-product").addEventListener("click", () => openProductModal());
    document.getElementById("products-search").addEventListener("input", renderProducts);
    document.getElementById("product-form").addEventListener("submit", saveProduct);

    document.getElementById("product-color").addEventListener("input", (ev) => {
        document.getElementById("product-color-text").value = ev.target.value.toUpperCase();
    });

    document.getElementById("products-tbody").addEventListener("click", (ev) => {
        const viewId = ev.target.getAttribute("data-view-product");
        const editId = ev.target.getAttribute("data-edit-product");
        const deleteId = ev.target.getAttribute("data-delete-product");

        if (viewId) {
            openProductDetail(viewId);
        }

        if (editId) {
            const product = productsState.items.find((item) => item.id === editId);
            if (product) openProductModal(product);
        }

        if (deleteId) deleteProductById(deleteId);
    });

    document.getElementById("product-detail-back").addEventListener("click", () => {
        window.location.hash = "#products";
    });

    document.getElementById("product-detail-tbody").addEventListener("click", (ev) => {
        const storeId = ev.target.getAttribute("data-add-inventory-store");
        const storeName = ev.target.getAttribute("data-add-inventory-store-name") || "";
        if (storeId) {
            openInventoryItemModal(storeId, storeName);
        }
    });

    document.getElementById("inventory-item-form").addEventListener("submit", saveInventoryItem);

    document.addEventListener("app:language-changed", () => {
        renderProducts();
        if (productsState.selectedProductId) {
            renderProductDetail();
            const product = productsState.items.find((item) => item.id === productsState.selectedProductId);
            if (product) {
                    document.getElementById("product-detail-title").textContent = `${t("productDetail.title")}: ${displayProductName(product.name)}`;
            }
        }
        const productFormTitle = document.getElementById("product-form-title");
        if (productFormTitle) {
            productFormTitle.textContent = productsState.editingId ? t("productForm.editTitle") : t("productForm.newTitle");
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    setupProductsEvents();
    loadProducts();

    document.addEventListener("app:product-price-changed", () => {
        loadProducts();
    });
});
