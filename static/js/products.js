const productsState = {
    items: [],
    editingId: null,
    selectedProductId: null,
    groupedInventory: null,
};

function filterProducts(list, term) {
    if (!term) return list;
    const query = term.toLowerCase();
    return list.filter((item) => String(item.name || "").toLowerCase().includes(query));
}

function colorSwatch(hex) {
    const value = hex || "#000000";
    return `<span class="swatch" style="background:${value}"></span> ${value}`;
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
                <td>${p.name || "-"}</td>
                <td>${colorSwatch(p.color)}</td>
                <td>${p.size || "-"}</td>
                <td>${p.price ?? "-"}</td>
                <td>
                    <button class="chip-btn" data-view-product="${p.id}">View</button>
                    <button class="chip-btn" data-edit-product="${p.id}">Edit</button>
                    <button class="chip-btn danger" data-delete-product="${p.id}">Delete</button>
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
        window.appApi.showAlert(err.message || "No se pudieron cargar productos.");
    }
}

function openProductModal(editing = null) {
    const dialog = document.getElementById("product-modal");
    const form = document.getElementById("product-form");
    window.appApi.clearFieldErrors(form);

    if (editing) {
        productsState.editingId = editing.id;
        document.getElementById("product-form-title").textContent = "Edit Product";
        document.getElementById("product-id").value = editing.id;
        document.getElementById("product-name").value = editing.name || "";
        document.getElementById("product-color").value = editing.color || "#FF0000";
        document.getElementById("product-color-text").value = editing.color || "#FF0000";
        document.getElementById("product-size").value = editing.size || "";
        document.getElementById("product-price").value = editing.price ?? "";
        document.getElementById("product-image").value = editing.image || "";
    } else {
        productsState.editingId = null;
        document.getElementById("product-form-title").textContent = "New Product";
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
        window.appApi.setFieldError(form, "name", "Minimo 2 caracteres.");
        valid = false;
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(payload.color)) {
        window.appApi.setFieldError(form, "color", "Color invalido #RRGGBB.");
        valid = false;
    }
    if (!["XS", "S", "M", "L", "XL"].includes(payload.size)) {
        window.appApi.setFieldError(form, "size", "Selecciona una talla.");
        valid = false;
    }
    if (!Number.isInteger(payload.price) || payload.price < 1) {
        window.appApi.setFieldError(form, "price", "Precio entero mayor que 0.");
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
            window.appApi.showAlert("Product updated", "success");
        } else {
            await window.appApi.api.post("/api/products", payload);
            window.appApi.showAlert("Product created", "success");
        }
        window.appApi.closeDialogById("product-modal");
        await loadProducts();
    } catch (err) {
        const details = err.details || {};
        if (details.fieldErrors) {
            Object.entries(details.fieldErrors).forEach(([k, v]) => window.appApi.setFieldError(form, k, v));
        }
        window.appApi.showAlert(err.message || "Error guardando producto");
    }
}

async function deleteProductById(entityId) {
    if (!window.confirm("Delete this product?")) return;
    try {
        await window.appApi.api.delete(`/api/products/${encodeURIComponent(entityId)}`);
        window.appApi.showAlert("Product deleted", "success");
        await loadProducts();
    } catch (err) {
        window.appApi.showAlert(err.message || "No se pudo borrar el producto.");
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
            <td><button class="chip-btn" data-add-inventory-store="${group.storeId}" data-add-inventory-store-name="${group.storeName}">Add InventoryItem</button></td>
        </tr>`);

        group.shelves.forEach((shelf) => {
            rows.push(`<tr class="child-row">
                <td>${shelf.shelfName}</td>
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
        window.appApi.showAlert(err.message || "No se pudo cargar el detalle del producto.");
    }
}

function openProductDetail(productId) {
    const product = productsState.items.find((item) => item.id === productId);
    if (!product) return;

    productsState.selectedProductId = productId;
    document.getElementById("product-detail-title").textContent = `Product Detail: ${product.name}`;
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
            select.innerHTML = '<option value="">No available shelves</option>';
            submitBtn.disabled = true;
            errorNode.textContent = "No hay shelves disponibles para este producto en la tienda.";
        } else {
            select.innerHTML = shelves.map((shelf) => `<option value="${shelf.id}">${shelf.name}</option>`).join("");
            submitBtn.disabled = false;
        }

        modal.showModal();
    } catch (err) {
        window.appApi.showAlert(err.message || "No se pudieron cargar shelves disponibles.");
    }
}

async function saveInventoryItem(event) {
    event.preventDefault();
    const productId = document.getElementById("inventory-product-id").value;
    const storeId = document.getElementById("inventory-store-id").value;
    const shelfId = document.getElementById("inventory-shelf-select").value;
    const errorNode = document.getElementById("inventory-shelf-error");
    errorNode.textContent = "";

    if (!shelfId) {
        errorNode.textContent = "Selecciona una shelf.";
        return;
    }

    try {
        await window.appApi.api.post(`/api/products/${encodeURIComponent(productId)}/inventory-items`, {
            refStore: storeId,
            refShelf: shelfId,
            shelfCount: 1,
            stockCount: 1,
        });
        window.appApi.closeDialogById("inventory-item-modal");
        window.appApi.showAlert("InventoryItem creado", "success");
        await loadProductDetail(productId);
    } catch (err) {
        errorNode.textContent = err.message || "No se pudo crear InventoryItem.";
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
}

document.addEventListener("DOMContentLoaded", () => {
    setupProductsEvents();
    loadProducts();

    document.addEventListener("app:product-price-changed", () => {
        loadProducts();
    });
});
