const storesState = {
    items: [],
    editingId: null,
    selectedStoreId: null,
    groupedInventory: null,
    notifications: [],
    detailMap: null,
    detailMarker: null,
    globalMap: null,
    globalMarkers: [],
};

function formatMetric(value, suffix) {
    if (value === undefined || value === null || value === "") return "-";
    return `${value}${suffix}`;
}

function filterStores(list, term) {
    if (!term) return list;
    const query = term.toLowerCase();
    return list.filter((item) => {
        const haystack = `${item.name || ""} ${item.countryCode || ""}`.toLowerCase();
        return haystack.includes(query);
    });
}

function getStoreCoordinates(store) {
    if (!store) return null;

    if (typeof store.longitude === "number" && typeof store.latitude === "number") {
        return { lon: store.longitude, lat: store.latitude };
    }

    const location = store.location;
    if (location && location.type === "Point" && Array.isArray(location.coordinates) && location.coordinates.length === 2) {
        const lon = Number(location.coordinates[0]);
        const lat = Number(location.coordinates[1]);
        if (!Number.isNaN(lon) && !Number.isNaN(lat)) {
            return { lon, lat };
        }
    }

    return null;
}

function fillLevelClass(percent) {
    if (percent >= 80) return "fill-high";
    if (percent >= 40) return "fill-medium";
    return "fill-low";
}

function metricTemperatureClass(temp) {
    if (temp >= 30) return "metric-hot";
    if (temp <= 10) return "metric-cold";
    return "metric-mild";
}

function metricHumidityClass(humidity) {
    if (humidity >= 70) return "metric-humid";
    if (humidity <= 30) return "metric-dry";
    return "metric-normal";
}

function renderStores() {
    const tbody = document.getElementById("stores-tbody");
    const empty = document.getElementById("stores-empty");
    const term = document.getElementById("stores-search").value.trim();
    const rows = filterStores(storesState.items, term);

    tbody.innerHTML = rows
        .map((store) => {
            const image = store.image ? `<img src="${store.image}" class="thumb" alt="${store.name}">` : "<span>-</span>";
            return `<tr>
                <td>${image}</td>
                <td>${store.name || "-"}</td>
                <td>${store.countryCode || "-"}</td>
                <td>${formatMetric(store.temperature, " °C")}</td>
                <td>${formatMetric(store.relativeHumidity, " %")}</td>
                <td>
                    <button class="chip-btn" data-view-store="${store.id}">View</button>
                    <button class="chip-btn" data-edit-store="${store.id}">Edit</button>
                    <button class="chip-btn danger" data-delete-store="${store.id}">Delete</button>
                </td>
            </tr>`;
        })
        .join("");

    empty.style.display = rows.length ? "none" : "block";
}

async function loadStoresView() {
    try {
        const payload = await window.appApi.api.get("/api/stores");
        storesState.items = payload.data || [];
        renderStores();
        if (window.location.hash.replace("#", "") === "store-map") {
            renderStoresMap();
        }
    } catch (err) {
        window.appApi.showAlert(err.message || "No se pudieron cargar las tiendas.");
    }
}

function openStoreModal(editing = null) {
    const dialog = document.getElementById("store-modal");
    const form = document.getElementById("store-form");
    window.appApi.clearFieldErrors(form);

    if (editing) {
        storesState.editingId = editing.id;
        document.getElementById("store-form-title").textContent = "Edit Store";
        document.getElementById("store-id").value = editing.id;
        document.getElementById("store-name").value = editing.name || "";
        document.getElementById("store-countryCode").value = editing.countryCode || "";
        document.getElementById("store-temperature").value = editing.temperature ?? "";
        document.getElementById("store-relativeHumidity").value = editing.relativeHumidity ?? "";
        document.getElementById("store-telephone").value = editing.telephone || "";
        document.getElementById("store-url").value = editing.url || "";
        document.getElementById("store-capacity").value = editing.capacity ?? "";
        document.getElementById("store-description").value = editing.description || "";
        document.getElementById("store-image").value = editing.image || "";
        const coords = getStoreCoordinates(editing);
        document.getElementById("store-longitude").value = coords ? coords.lon : "";
        document.getElementById("store-latitude").value = coords ? coords.lat : "";
    } else {
        storesState.editingId = null;
        document.getElementById("store-form-title").textContent = "New Store";
        form.reset();
    }

    dialog.showModal();
}

function collectStorePayload() {
    const capacityValue = document.getElementById("store-capacity").value;
    return {
        name: document.getElementById("store-name").value.trim(),
        countryCode: document.getElementById("store-countryCode").value.trim().toUpperCase(),
        temperature: Number(document.getElementById("store-temperature").value),
        relativeHumidity: Number(document.getElementById("store-relativeHumidity").value),
        telephone: document.getElementById("store-telephone").value.trim(),
        url: document.getElementById("store-url").value.trim(),
        capacity: capacityValue === "" ? "" : Number(capacityValue),
        description: document.getElementById("store-description").value.trim(),
        image: document.getElementById("store-image").value.trim(),
        longitude: Number(document.getElementById("store-longitude").value),
        latitude: Number(document.getElementById("store-latitude").value),
    };
}

function clientValidateStore(payload, form) {
    let valid = true;
    window.appApi.clearFieldErrors(form);

    if (payload.name.length < 2) {
        window.appApi.setFieldError(form, "name", "Minimo 2 caracteres.");
        valid = false;
    }
    if (!/^[A-Za-z]{2}$/.test(payload.countryCode)) {
        window.appApi.setFieldError(form, "countryCode", "Country code de 2 letras.");
        valid = false;
    }
    if (Number.isNaN(payload.temperature) || payload.temperature < -50 || payload.temperature > 50) {
        window.appApi.setFieldError(form, "temperature", "Temperatura entre -50 y 50.");
        valid = false;
    }
    if (Number.isNaN(payload.relativeHumidity) || payload.relativeHumidity < 0 || payload.relativeHumidity > 100) {
        window.appApi.setFieldError(form, "relativeHumidity", "Humedad entre 0 y 100.");
        valid = false;
    }
    if (payload.url && !/^https?:\/\//.test(payload.url)) {
        window.appApi.setFieldError(form, "url", "URL invalida.");
        valid = false;
    }
    if (payload.image && !/^https?:\/\//.test(payload.image)) {
        window.appApi.setFieldError(form, "image", "Image URL invalida.");
        valid = false;
    }
    if (Number.isNaN(payload.longitude) || payload.longitude < -180 || payload.longitude > 180) {
        window.appApi.setFieldError(form, "longitude", "Longitud entre -180 y 180.");
        valid = false;
    }
    if (Number.isNaN(payload.latitude) || payload.latitude < -90 || payload.latitude > 90) {
        window.appApi.setFieldError(form, "latitude", "Latitud entre -90 y 90.");
        valid = false;
    }

    return valid;
}

async function saveStore(event) {
    event.preventDefault();
    const form = document.getElementById("store-form");
    const payload = collectStorePayload();
    const isEditing = Boolean(storesState.editingId);

    if (!clientValidateStore(payload, form)) return;

    if (payload.capacity === "") delete payload.capacity;
    if (!payload.url) delete payload.url;
    if (!payload.telephone) delete payload.telephone;
    if (!payload.description) delete payload.description;
    if (!payload.image) delete payload.image;

    try {
        if (isEditing) {
            await window.appApi.api.patch(`/api/stores/${encodeURIComponent(storesState.editingId)}`, payload);
            window.appApi.showAlert("Store updated", "success");
        } else {
            await window.appApi.api.post("/api/stores", payload);
            window.appApi.showAlert("Store created", "success");
        }
        window.appApi.closeDialogById("store-modal");
        await loadStoresView();
        document.dispatchEvent(new CustomEvent("app:stores-updated"));
    } catch (err) {
        const details = err.details || {};
        if (details.fieldErrors) {
            Object.entries(details.fieldErrors).forEach(([k, v]) => window.appApi.setFieldError(form, k, v));
        }
        window.appApi.showAlert(err.message || "Error guardando tienda");
    }
}

async function deleteStore(entityId) {
    if (!window.confirm("Delete this store?")) return;
    try {
        await window.appApi.api.delete(`/api/stores/${encodeURIComponent(entityId)}`);
        window.appApi.showAlert("Store deleted", "success");
        await loadStoresView();
        document.dispatchEvent(new CustomEvent("app:stores-updated"));
    } catch (err) {
        window.appApi.showAlert(err.message || "No se pudo borrar la tienda.");
    }
}

function renderStoreNotifications() {
    const container = document.getElementById("store-detail-notifications");
    if (!container) return;

    if (!storesState.notifications.length) {
        container.innerHTML = '<p class="empty-state">No notifications for this store yet.</p>';
        return;
    }

    container.innerHTML = storesState.notifications
        .map((item) => {
            const ts = item.timestamp ? new Date(item.timestamp).toLocaleTimeString("es-ES") : "-";
            return `<div class="notification-item ${item.type}">
                <div class="notification-header">
                    <span class="notification-title">${item.title}</span>
                    <span class="notification-time">${ts}</span>
                </div>
                <div class="notification-body">${item.message}</div>
            </div>`;
        })
        .join("");
}

function renderStoreTweets(tweets = []) {
    const ul = document.getElementById("store-detail-tweets");
    if (!ul) return;

    if (!tweets.length) {
        ul.innerHTML = "<li>-</li>";
        return;
    }

    ul.innerHTML = tweets.map((tweet) => `<li><i class="fa-brands fa-x-twitter"></i><span>${tweet}</span></li>`).join("");
}

function renderStoreDetailMap(store) {
    const container = document.getElementById("store-detail-map");
    if (!container || typeof L === "undefined") return;

    const coords = getStoreCoordinates(store);
    if (!coords) {
        container.innerHTML = '<p class="empty-state">This store has no coordinates yet.</p>';
        if (storesState.detailMap) {
            storesState.detailMap.remove();
            storesState.detailMap = null;
            storesState.detailMarker = null;
        }
        return;
    }

    if (!storesState.detailMap) {
        storesState.detailMap = L.map("store-detail-map");
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap",
        }).addTo(storesState.detailMap);
    }

    const latLng = [coords.lat, coords.lon];
    storesState.detailMap.setView(latLng, 15);

    if (storesState.detailMarker) {
        storesState.detailMarker.setLatLng(latLng);
    } else {
        storesState.detailMarker = L.marker(latLng).addTo(storesState.detailMap);
    }

    storesState.detailMarker.bindPopup(`<strong>${store.name || "Store"}</strong>`);
    setTimeout(() => storesState.detailMap.invalidateSize(), 60);
}

function renderStoresMap() {
    const canvas = document.getElementById("stores-map");
    const empty = document.getElementById("stores-map-empty");
    if (!canvas || typeof L === "undefined") return;

    const locatedStores = storesState.items.filter((item) => Boolean(getStoreCoordinates(item)));
    empty.style.display = locatedStores.length ? "none" : "block";

    if (!storesState.globalMap) {
        storesState.globalMap = L.map("stores-map");
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap",
        }).addTo(storesState.globalMap);
    }

    storesState.globalMarkers.forEach((marker) => marker.remove());
    storesState.globalMarkers = [];

    const bounds = [];
    locatedStores.forEach((store) => {
        const coords = getStoreCoordinates(store);
        if (!coords) return;

        const latLng = [coords.lat, coords.lon];
        bounds.push(latLng);

        const marker = L.marker(latLng).addTo(storesState.globalMap);
        const card = `<div class="map-store-card">
            <strong>${store.name || "Store"}</strong><br>
            ${store.countryCode || "-"}<br>
            T: ${formatMetric(store.temperature, " C")} | H: ${formatMetric(store.relativeHumidity, " %")}
        </div>`;
        marker.bindPopup(card);
        marker.on("mouseover", () => marker.openPopup());
        marker.on("mouseout", () => marker.closePopup());
        marker.on("click", () => {
            openStoreDetail(store.id);
        });
        storesState.globalMarkers.push(marker);
    });

    if (bounds.length) {
        storesState.globalMap.fitBounds(bounds, { padding: [24, 24] });
    } else {
        storesState.globalMap.setView([52.52, 13.405], 11);
    }

    setTimeout(() => storesState.globalMap.invalidateSize(), 60);
}

function renderStoreDetail() {
    const tbody = document.getElementById("store-detail-tbody");
    const empty = document.getElementById("store-detail-empty");
    const payload = storesState.groupedInventory || {};
    const store = payload.store || {};
    const shelves = payload.shelves || [];

    document.getElementById("store-detail-title").textContent = `Store Detail: ${store.name || storesState.selectedStoreId || "-"}`;
    document.getElementById("store-detail-temp").textContent = formatMetric(store.temperature, " °C");
    document.getElementById("store-detail-humidity").textContent = formatMetric(store.relativeHumidity, " %");

    const tempChip = document.getElementById("store-detail-temp-chip");
    const humidityChip = document.getElementById("store-detail-humidity-chip");
    tempChip.classList.remove("metric-cold", "metric-mild", "metric-hot");
    humidityChip.classList.remove("metric-dry", "metric-normal", "metric-humid");
    tempChip.classList.add(metricTemperatureClass(Number(store.temperature)));
    humidityChip.classList.add(metricHumidityClass(Number(store.relativeHumidity)));

    renderStoreDetailMap(store);
    renderStoreTweets(Array.isArray(store.tweets) ? store.tweets : []);

    const rows = [];
    shelves.forEach((shelf) => {
        const shelfName = shelf.shelfName || shelf.shelfId;
        const fillPercent = shelf.fillPercent || 0;
        const fillClass = fillLevelClass(fillPercent);
        rows.push(`<tr class="group-row">
            <td><strong>${shelfName}</strong></td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>
                <div class="shelf-fill-wrap">
                    <div class="shelf-fill-track">
                        <div class="shelf-fill-bar ${fillClass}" style="width:${fillPercent}%"></div>
                    </div>
                    <strong>${shelf.fillCount || 0}/${shelf.maxCapacity || 0} (${fillPercent}%)</strong>
                </div>
            </td>
            <td>
                <button class="chip-btn" data-edit-shelf="${shelf.shelfId}" data-edit-shelf-name="${shelfName}" data-edit-shelf-capacity="${shelf.maxCapacity || 0}">Edit Shelf</button>
                <button class="chip-btn" data-add-store-inventory="${shelf.shelfId}" data-add-store-inventory-name="${shelfName}">Add InventoryItem</button>
            </td>
        </tr>`);

        (shelf.items || []).forEach((item) => {
            rows.push(`<tr class="child-row">
                <td>${item.name || "-"}</td>
                <td>${item.price ?? "-"}</td>
                <td>${item.size || "-"}</td>
                <td>${item.color || "-"}</td>
                <td>${item.stockCount ?? 0}</td>
                <td>${item.shelfCount ?? 0}</td>
                <td>
                    <button class="chip-btn" data-buy-inventory-item="${item.inventoryItemId}">Buy Unit</button>
                </td>
            </tr>`);
        });
    });

    tbody.innerHTML = rows.join("");
    empty.style.display = rows.length ? "none" : "block";
    renderStoreNotifications();
}

async function loadStoreDetail(storeId) {
    try {
        const payload = await window.appApi.api.get(`/api/stores/${encodeURIComponent(storeId)}/inventory-grouped`);
        storesState.groupedInventory = payload.data || { shelves: [] };
        renderStoreDetail();
    } catch (err) {
        window.appApi.showAlert(err.message || "No se pudo cargar el detalle de la tienda.");
    }
}

function openStoreDetail(storeId) {
    storesState.selectedStoreId = storeId;
    storesState.notifications = [];
    window.location.hash = "#store-detail";
    loadStoreDetail(storeId);
}

function openShelfModal(editing = null) {
    const modal = document.getElementById("shelf-modal");
    const form = document.getElementById("shelf-form");
    window.appApi.clearFieldErrors(form);

    if (editing) {
        document.getElementById("shelf-form-title").textContent = "Edit Shelf";
        document.getElementById("shelf-id").value = editing.id;
        document.getElementById("shelf-name").value = editing.name || "";
        document.getElementById("shelf-max-capacity").value = editing.maxCapacity ?? "";
    } else {
        document.getElementById("shelf-form-title").textContent = "New Shelf";
        form.reset();
        document.getElementById("shelf-id").value = "";
    }

    modal.showModal();
}

async function saveShelf(event) {
    event.preventDefault();
    const storeId = storesState.selectedStoreId;
    if (!storeId) return;

    const shelfId = document.getElementById("shelf-id").value.trim();
    const name = document.getElementById("shelf-name").value.trim();
    const maxCapacity = Number(document.getElementById("shelf-max-capacity").value);
    const form = document.getElementById("shelf-form");
    window.appApi.clearFieldErrors(form);

    if (name.length < 2) {
        const target = form.querySelector('[data-error-for="shelf-name"]');
        if (target) target.textContent = "Minimo 2 caracteres.";
        return;
    }
    if (!Number.isInteger(maxCapacity) || maxCapacity <= 0) {
        const target = form.querySelector('[data-error-for="shelf-max-capacity"]');
        if (target) target.textContent = "Capacidad entera mayor que 0.";
        return;
    }

    try {
        if (shelfId) {
            await window.appApi.api.patch(`/api/shelves/${encodeURIComponent(shelfId)}`, {
                name,
                maxCapacity,
            });
            window.appApi.showAlert("Shelf updated", "success");
        } else {
            await window.appApi.api.post(`/api/stores/${encodeURIComponent(storeId)}/shelves`, {
                name,
                maxCapacity,
            });
            window.appApi.showAlert("Shelf created", "success");
        }
        window.appApi.closeDialogById("shelf-modal");
        await loadStoreDetail(storeId);
    } catch (err) {
        window.appApi.showAlert(err.message || "No se pudo guardar la shelf.");
    }
}

async function openStoreInventoryModal(shelfId, shelfName) {
    const storeId = storesState.selectedStoreId;
    if (!storeId) return;

    const modal = document.getElementById("store-inventory-modal");
    const select = document.getElementById("store-inventory-product-select");
    const errorNode = document.getElementById("store-inventory-product-error");
    const submitBtn = document.getElementById("store-inventory-submit");

    document.getElementById("store-inventory-shelf-id").value = shelfId;
    document.getElementById("store-inventory-shelf-name").value = shelfName || shelfId;
    document.getElementById("store-inventory-shelf-count").value = 1;
    document.getElementById("store-inventory-stock-count").value = 1;
    errorNode.textContent = "";

    try {
        const payload = await window.appApi.api.get(
            `/api/stores/${encodeURIComponent(storeId)}/available-products?shelfId=${encodeURIComponent(shelfId)}`
        );
        const products = payload.data || [];
        if (!products.length) {
            select.innerHTML = '<option value="">No available products</option>';
            submitBtn.disabled = true;
            errorNode.textContent = "No hay productos disponibles para esta shelf.";
        } else {
            select.innerHTML = products.map((product) => `<option value="${product.id}">${product.name}</option>`).join("");
            submitBtn.disabled = false;
        }
        modal.showModal();
    } catch (err) {
        window.appApi.showAlert(err.message || "No se pudieron cargar productos disponibles.");
    }
}

async function saveStoreInventoryItem(event) {
    event.preventDefault();
    const storeId = storesState.selectedStoreId;
    if (!storeId) return;

    const shelfId = document.getElementById("store-inventory-shelf-id").value;
    const productId = document.getElementById("store-inventory-product-select").value;
    const shelfCount = Number(document.getElementById("store-inventory-shelf-count").value);
    const stockCount = Number(document.getElementById("store-inventory-stock-count").value);
    const errorNode = document.getElementById("store-inventory-product-error");
    errorNode.textContent = "";

    if (!productId) {
        errorNode.textContent = "Selecciona un producto.";
        return;
    }
    if (!Number.isInteger(shelfCount) || shelfCount < 0 || !Number.isInteger(stockCount) || stockCount < 0) {
        errorNode.textContent = "Stock y shelf deben ser enteros >= 0.";
        return;
    }

    try {
        await window.appApi.api.post(`/api/stores/${encodeURIComponent(storeId)}/inventory-items`, {
            refShelf: shelfId,
            refProduct: productId,
            shelfCount,
            stockCount,
        });
        window.appApi.closeDialogById("store-inventory-modal");
        window.appApi.showAlert("InventoryItem creado", "success");
        await loadStoreDetail(storeId);
    } catch (err) {
        errorNode.textContent = err.message || "No se pudo crear InventoryItem.";
    }
}

async function buyInventoryItem(inventoryItemId) {
    if (!storesState.selectedStoreId) return;
    try {
        await window.appApi.api.post(`/api/inventory-items/${encodeURIComponent(inventoryItemId)}/buy`, {});
        window.appApi.showAlert("Purchase registered", "success");
        await loadStoreDetail(storesState.selectedStoreId);
    } catch (err) {
        window.appApi.showAlert(err.message || "No se pudo registrar la compra.");
    }
}

function pushStoreNotification(type, title, message, timestamp) {
    storesState.notifications.unshift({ type, title, message, timestamp });
    storesState.notifications = storesState.notifications.slice(0, 20);
    if (window.location.hash.replace("#", "") === "store-detail") {
        renderStoreNotifications();
    }
}

function setupStoresEvents() {
    document.getElementById("btn-new-store").addEventListener("click", () => openStoreModal());
    document.getElementById("btn-add-shelf").addEventListener("click", () => openShelfModal());
    document.getElementById("stores-search").addEventListener("input", renderStores);
    document.getElementById("store-form").addEventListener("submit", saveStore);
    document.getElementById("shelf-form").addEventListener("submit", saveShelf);
    document.getElementById("store-inventory-form").addEventListener("submit", saveStoreInventoryItem);

    document.getElementById("stores-tbody").addEventListener("click", (ev) => {
        const viewId = ev.target.getAttribute("data-view-store");
        const editId = ev.target.getAttribute("data-edit-store");
        const deleteId = ev.target.getAttribute("data-delete-store");

        if (viewId) {
            openStoreDetail(viewId);
        }

        if (editId) {
            const store = storesState.items.find((item) => item.id === editId);
            if (store) openStoreModal(store);
        }

        if (deleteId) {
            deleteStore(deleteId);
        }
    });

    document.getElementById("store-detail-back").addEventListener("click", () => {
        window.location.hash = "#stores";
    });

    document.getElementById("store-detail-tbody").addEventListener("click", (ev) => {
        const editShelfId = ev.target.getAttribute("data-edit-shelf");
        const editShelfName = ev.target.getAttribute("data-edit-shelf-name") || "";
        const editShelfCapacity = Number(ev.target.getAttribute("data-edit-shelf-capacity") || 0);
        const addShelfId = ev.target.getAttribute("data-add-store-inventory");
        const addShelfName = ev.target.getAttribute("data-add-store-inventory-name") || "";
        const buyId = ev.target.getAttribute("data-buy-inventory-item");

        if (editShelfId) {
            openShelfModal({ id: editShelfId, name: editShelfName, maxCapacity: editShelfCapacity });
        }
        if (addShelfId) {
            openStoreInventoryModal(addShelfId, addShelfName);
        }
        if (buyId) {
            buyInventoryItem(buyId);
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    setupStoresEvents();
    await loadStoresView();

    window.addEventListener("hashchange", () => {
        if (window.location.hash.replace("#", "") === "store-map") {
            renderStoresMap();
        }
    });

    document.addEventListener("app:product-price-changed", (ev) => {
        const detail = ev.detail || {};
        if (!storesState.selectedStoreId) return;
        const message = `${detail.productName || detail.entityId || "Product"}: €${detail.newPrice ?? "-"}`;
        pushStoreNotification("price", "Price updated", message, detail.timestamp);
    });

    document.addEventListener("app:stock-alert", (ev) => {
        const detail = ev.detail || {};
        if (!storesState.selectedStoreId) return;
        const message = `${detail.entityId || "InventoryItem"}: stock=${detail.currentStock ?? "-"}, shelf=${detail.shelfStock ?? "-"}`;
        pushStoreNotification("stock", "Stock alert", message, detail.timestamp);
    });

    document.addEventListener("app:stores-updated", () => {
        if (window.location.hash.replace("#", "") === "store-map") {
            renderStoresMap();
        }
    });
});
