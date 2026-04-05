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
    store3dView: null,
    threeLoaderPromise: null,
};

function t(key, params) {
    return window.appI18n ? window.appI18n.t(key, params) : key;
}

function formatMetric(value, suffix) {
    if (value === undefined || value === null || value === "") return "-";
    return `${value}${suffix}`;
}

function countryFlagHtml(countryCode, label) {
    const normalized = String(countryCode || "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalized)) {
        return `<i class="fa-solid fa-flag" aria-hidden="true"></i>`;
    }
    const lower = normalized.toLowerCase();
    const alt = label || normalized;
    return `<img class="country-flag" src="https://flagcdn.com/w20/${lower}.png" alt="${alt}" loading="lazy">`;
}

function colorSwatch(hex) {
    if (!hex) return "-";
    return `<span class="swatch" style="background:${hex}"></span> ${hex}`;
}

function buildStoreMapPopup(store) {
    const image = store.image
        ? `<img src="${store.image}" class="map-popup-image" alt="${store.name || "Store"}">`
        : "<div class=\"map-popup-image map-popup-image-empty\"><i class=\"fa-solid fa-store\" aria-hidden=\"true\"></i></div>";

    return `<article class="map-store-card">
        ${image}
        <div class="map-popup-info">
            <h4>${store.name || "Store"}</h4>
            <p>${countryFlagHtml(store.countryCode, store.name || "Store country")} ${store.countryCode || "-"}</p>
            <p><i class="fa-solid fa-temperature-half" aria-hidden="true"></i> ${formatMetric(store.temperature, " °C")}</p>
            <p><i class="fa-solid fa-droplet" aria-hidden="true"></i> ${formatMetric(store.relativeHumidity, " %")}</p>
        </div>
    </article>`;
}

function buildStoreMarkerIcon(store) {
    const markerImage = store.image
        ? `<img src="${store.image}" class="store-map-marker-image" alt="${store.name || "Store"}">`
        : `<span class="store-map-marker-fallback"><i class="fa-solid fa-store" aria-hidden="true"></i></span>`;

    return L.divIcon({
        className: "store-map-marker",
        html: `<div class="store-map-marker-wrap">${markerImage}</div>`,
        iconSize: [54, 54],
        iconAnchor: [27, 27],
        popupAnchor: [0, -24],
    });
}

function displayShelfName(name) {
    return window.appI18n ? window.appI18n.translateDomainValue("shelfName", name) : name;
}

function displayProductName(name) {
    return window.appI18n ? window.appI18n.translateDomainValue("productName", name) : name;
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
            const image = store.image ? `<img src="${store.image}" class="thumb store-photo" alt="${store.name}">` : "<span>-</span>";
            const countryCode = (store.countryCode || "-").toUpperCase();
            const country = `<span class="country-chip">${countryFlagHtml(countryCode, countryCode)} ${countryCode}</span>`;
            return `<tr>
                <td>${image}</td>
                <td>${store.name || "-"}</td>
                <td>${country}</td>
                <td><i class="fa-solid fa-temperature-half" aria-hidden="true"></i> ${formatMetric(store.temperature, " °C")}</td>
                <td><i class="fa-solid fa-droplet" aria-hidden="true"></i> ${formatMetric(store.relativeHumidity, " %")}</td>
                <td>
                    <button class="chip-btn" data-view-store="${store.id}">${t("actions.view")}</button>
                    <button class="chip-btn" data-edit-store="${store.id}">${t("actions.edit")}</button>
                    <button class="chip-btn danger" data-delete-store="${store.id}">${t("actions.delete")}</button>
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
        window.appApi.showAlert(err.message || t("alerts.loadStores"));
    }
}

function openStoreModal(editing = null) {
    const dialog = document.getElementById("store-modal");
    const form = document.getElementById("store-form");
    window.appApi.clearFieldErrors(form);

    if (editing) {
        storesState.editingId = editing.id;
        document.getElementById("store-form-title").textContent = t("storeForm.editTitle");
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
        document.getElementById("store-form-title").textContent = t("storeForm.newTitle");
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
        window.appApi.setFieldError(form, "name", t("errors.min2"));
        valid = false;
    }
    if (!/^[A-Za-z]{2}$/.test(payload.countryCode)) {
        window.appApi.setFieldError(form, "countryCode", t("errors.countryCode"));
        valid = false;
    }
    if (Number.isNaN(payload.temperature) || payload.temperature < -50 || payload.temperature > 50) {
        window.appApi.setFieldError(form, "temperature", t("errors.temperatureRange"));
        valid = false;
    }
    if (Number.isNaN(payload.relativeHumidity) || payload.relativeHumidity < 0 || payload.relativeHumidity > 100) {
        window.appApi.setFieldError(form, "relativeHumidity", t("errors.humidityRange"));
        valid = false;
    }
    if (payload.url && !/^https?:\/\//.test(payload.url)) {
        window.appApi.setFieldError(form, "url", t("errors.invalidUrl"));
        valid = false;
    }
    if (payload.image && !/^https?:\/\//.test(payload.image)) {
        window.appApi.setFieldError(form, "image", t("errors.invalidImageUrl"));
        valid = false;
    }
    if (Number.isNaN(payload.longitude) || payload.longitude < -180 || payload.longitude > 180) {
        window.appApi.setFieldError(form, "longitude", t("errors.longitudeRange"));
        valid = false;
    }
    if (Number.isNaN(payload.latitude) || payload.latitude < -90 || payload.latitude > 90) {
        window.appApi.setFieldError(form, "latitude", t("errors.latitudeRange"));
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
            window.appApi.showAlert(t("success.storeUpdated"), "success");
        } else {
            await window.appApi.api.post("/api/stores", payload);
            window.appApi.showAlert(t("success.storeCreated"), "success");
        }
        window.appApi.closeDialogById("store-modal");
        await loadStoresView();
        document.dispatchEvent(new CustomEvent("app:stores-updated"));
    } catch (err) {
        const details = err.details || {};
        if (details.fieldErrors) {
            Object.entries(details.fieldErrors).forEach(([k, v]) => window.appApi.setFieldError(form, k, v));
        }
        window.appApi.showAlert(err.message || t("errors.saveStore"));
    }
}

async function deleteStore(entityId) {
    if (!window.confirm(t("confirm.deleteStore"))) return;
    try {
        await window.appApi.api.delete(`/api/stores/${encodeURIComponent(entityId)}`);
        window.appApi.showAlert(t("success.storeDeleted"), "success");
        await loadStoresView();
        document.dispatchEvent(new CustomEvent("app:stores-updated"));
    } catch (err) {
        window.appApi.showAlert(err.message || t("errors.deleteStore"));
    }
}

function renderStoreNotifications() {
    const container = document.getElementById("store-detail-notifications");
    if (!container) return;

    if (!storesState.notifications.length) {
        container.innerHTML = `<p class="empty-state">${t("storeDetail.noNotifications")}</p>`;
        return;
    }

    container.innerHTML = storesState.notifications
        .map((item) => {
            const ts = item.timestamp && window.appI18n
                ? window.appI18n.formatTime(item.timestamp)
                : (item.timestamp ? new Date(item.timestamp).toLocaleTimeString("es-ES") : "-");
            const title = item.kind === "price" ? t("storeNotif.priceTitle") : t("storeNotif.stockTitle");
            const message = item.kind === "price"
                ? t("storeNotif.price", { ...item.payload, product: displayProductName(item.payload.product) })
                : t("storeNotif.stock", item.payload);
            return `<div class="notification-item ${item.type}">
                <div class="notification-header">
                    <span class="notification-title">${title}</span>
                    <span class="notification-time">${ts}</span>
                </div>
                <div class="notification-body">${message}</div>
            </div>`;
        })
        .join("");
}

function renderStoreTweets(tweets = []) {
    const ul = document.getElementById("store-detail-tweets");
    if (!ul) return;

    if (!tweets.length) {
        ul.innerHTML = `<li>${t("storeDetail.noTweets")}</li>`;
        return;
    }

    ul.innerHTML = tweets.map((tweet) => `<li><i class="fa-brands fa-x-twitter"></i><span>${tweet}</span></li>`).join("");
}

function renderStoreDetailMap(store) {
    const container = document.getElementById("store-detail-map");
    if (!container || typeof L === "undefined") return;

    const coords = getStoreCoordinates(store);
    if (!coords) {
        container.innerHTML = `<p class="empty-state">${t("storeDetail.noCoordinates")}</p>`;
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

        const marker = L.marker(latLng, { icon: buildStoreMarkerIcon(store) }).addTo(storesState.globalMap);
        marker.bindPopup(buildStoreMapPopup(store), {
            closeButton: false,
            className: "store-popup",
            autoPanPaddingTopLeft: [24, 24],
        });
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

function loadThreeFromUrl(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = url;
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => {
            script.remove();
            reject(new Error(`Failed loading ${url}`));
        };
        document.head.appendChild(script);
    });
}

async function ensureThreeJsLoaded() {
    if (typeof window.THREE !== "undefined") {
        return true;
    }

    if (storesState.threeLoaderPromise) {
        return storesState.threeLoaderPromise;
    }

    const statusNode = document.getElementById("store-3d-status");
    if (statusNode) {
        statusNode.textContent = "Loading Three.js...";
    }

    storesState.threeLoaderPromise = (async () => {
        const urls = [
            "/static/js/vendor/three.min.js",
            "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js",
            "https://unpkg.com/three@0.160.0/build/three.min.js",
        ];

        for (const url of urls) {
            try {
                await loadThreeFromUrl(url);
                if (typeof window.THREE !== "undefined") {
                    return true;
                }
            } catch (err) {
                // Keep trying the next URL.
            }
        }

        return false;
    })();

    const ok = await storesState.threeLoaderPromise;
    if (!ok && statusNode) {
        statusNode.textContent = window.appI18n
            ? window.appI18n.t("three.unavailable")
            : "3D view unavailable (Three.js not loaded).";
    }

    return ok;
}

async function ensureStore3DView() {
    if (storesState.store3dView) return true;

    const loaded = await ensureThreeJsLoaded();
    if (!loaded || typeof window.Store3DView !== "function") return false;

    storesState.store3dView = new window.Store3DView("store-3d-canvas", "store-3d-status");
    return Boolean(storesState.store3dView);
}

function destroyStore3DView() {
    if (!storesState.store3dView) return;
    storesState.store3dView.destroy();
    storesState.store3dView = null;
}

function renderStoreDetail() {
    const tbody = document.getElementById("store-detail-tbody");
    const empty = document.getElementById("store-detail-empty");
    const payload = storesState.groupedInventory || {};
    const store = payload.store || {};
    const shelves = payload.shelves || [];

    document.getElementById("store-detail-title").textContent = `${t("storeDetail.title")}: ${store.name || storesState.selectedStoreId || "-"}`;
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
        const shelfName = displayShelfName(shelf.shelfName || shelf.shelfId);
        const fillPercent = shelf.fillPercent || 0;
        const fillClass = fillLevelClass(fillPercent);
        rows.push(`<tr class="group-row" data-shelf-group="${shelf.shelfId}">
            <td><strong>${shelfName}</strong></td>
            <td>
                <div class="shelf-fill-wrap">
                    <div class="shelf-fill-track">
                        <div class="shelf-fill-bar ${fillClass}" style="width:${fillPercent}%"></div>
                    </div>
                    <strong>${shelf.fillCount || 0}/${shelf.maxCapacity || 0} (${fillPercent}%)</strong>
                </div>
            </td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>
                    <button class="chip-btn" data-edit-shelf="${shelf.shelfId}" data-edit-shelf-name="${shelfName}" data-edit-shelf-capacity="${shelf.maxCapacity || 0}">${t("actions.editShelf")}</button>
                    <button class="chip-btn" data-add-store-inventory="${shelf.shelfId}" data-add-store-inventory-name="${shelfName}">${t("actions.addInventoryItem")}</button>
            </td>
        </tr>`);

        (shelf.items || []).forEach((item) => {
            const image = item.image ? `<img src="${item.image}" class="thumb" alt="${item.name || "Product"}">` : "<span>-</span>";
            rows.push(`<tr class="child-row">
                <td>${displayProductName(item.name) || "-"}</td>
                <td>${image}</td>
                <td>${item.price ?? "-"}</td>
                <td>${item.size || "-"}</td>
                <td>${colorSwatch(item.color)}</td>
                <td>${item.stockCount ?? 0}</td>
                <td>${item.shelfCount ?? 0}</td>
                <td>
                    <button class="chip-btn" data-buy-inventory-item="${item.inventoryItemId}">${t("actions.buyUnit")}</button>
                </td>
            </tr>`);
        });
    });

    tbody.innerHTML = rows.join("");
    empty.style.display = rows.length ? "none" : "block";

    if (storesState.store3dView) {
        storesState.store3dView.renderStoreInventory(payload);
    } else {
        ensureStore3DView().then((ready) => {
            if (ready && storesState.store3dView) {
                storesState.store3dView.renderStoreInventory(payload);
            }
        });
    }

    renderStoreNotifications();
}

async function loadStoreDetail(storeId) {
    try {
        const payload = await window.appApi.api.get(`/api/stores/${encodeURIComponent(storeId)}/inventory-grouped`);
        storesState.groupedInventory = payload.data || { shelves: [] };
        renderStoreDetail();
    } catch (err) {
        window.appApi.showAlert(err.message || t("errors.loadStoreDetail"));
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
        document.getElementById("shelf-form-title").textContent = t("shelfForm.editTitle");
        document.getElementById("shelf-id").value = editing.id;
        document.getElementById("shelf-name").value = editing.name || "";
        document.getElementById("shelf-max-capacity").value = editing.maxCapacity ?? "";
    } else {
        document.getElementById("shelf-form-title").textContent = t("shelfForm.newTitle");
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
        if (target) target.textContent = t("errors.min2");
        return;
    }
    if (!Number.isInteger(maxCapacity) || maxCapacity <= 0) {
        const target = form.querySelector('[data-error-for="shelf-max-capacity"]');
        if (target) target.textContent = t("errors.maxCapacityPositive");
        return;
    }

    try {
        if (shelfId) {
            await window.appApi.api.patch(`/api/shelves/${encodeURIComponent(shelfId)}`, {
                name,
                maxCapacity,
            });
            window.appApi.showAlert(t("success.shelfUpdated"), "success");
        } else {
            await window.appApi.api.post(`/api/stores/${encodeURIComponent(storeId)}/shelves`, {
                name,
                maxCapacity,
            });
            window.appApi.showAlert(t("success.shelfCreated"), "success");
        }
        window.appApi.closeDialogById("shelf-modal");
        await loadStoreDetail(storeId);
    } catch (err) {
        window.appApi.showAlert(err.message || t("errors.saveShelf"));
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
            select.innerHTML = `<option value="">${t("inventory.noAvailableProducts")}</option>`;
            submitBtn.disabled = true;
            errorNode.textContent = t("inventory.noProductsForShelf");
        } else {
            select.innerHTML = products.map((product) => `<option value="${product.id}">${product.name}</option>`).join("");
            submitBtn.disabled = false;
        }
        modal.showModal();
    } catch (err) {
        window.appApi.showAlert(err.message || t("errors.loadAvailableProducts"));
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
        errorNode.textContent = t("errors.selectProduct");
        return;
    }
    if (!Number.isInteger(shelfCount) || shelfCount < 0 || !Number.isInteger(stockCount) || stockCount < 0) {
        errorNode.textContent = t("errors.nonNegativeInventory");
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
        window.appApi.showAlert(t("success.inventoryItemCreated"), "success");
        await loadStoreDetail(storeId);
    } catch (err) {
        errorNode.textContent = err.message || t("errors.createInventoryItem");
    }
}

async function buyInventoryItem(inventoryItemId) {
    if (!storesState.selectedStoreId) return;
    try {
        await window.appApi.api.post(`/api/inventory-items/${encodeURIComponent(inventoryItemId)}/buy`, {});
        window.appApi.showAlert(t("success.purchaseRegistered"), "success");
        await loadStoreDetail(storesState.selectedStoreId);
    } catch (err) {
        window.appApi.showAlert(err.message || t("errors.registerPurchase"));
    }
}

function pushStoreNotification(type, title, message, timestamp) {
    storesState.notifications.unshift({ type, title, message, timestamp, kind: type, payload: {} });
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
        destroyStore3DView();
        window.location.hash = "#stores";
    });

    document.getElementById("btn-3d-reset").addEventListener("click", () => {
        if (!storesState.store3dView) return;
        storesState.store3dView.resetCamera();
    });

    document.getElementById("btn-3d-focus-next").addEventListener("click", () => {
        if (!storesState.store3dView) return;
        storesState.store3dView.focusNextShelf();
    });

    document.getElementById("store-detail-tbody").addEventListener("click", (ev) => {
        const shelfRow = ev.target.closest("tr[data-shelf-group]");
        if (shelfRow && storesState.store3dView) {
            const shelfId = shelfRow.getAttribute("data-shelf-group");
            if (shelfId) storesState.store3dView.focusShelfById(shelfId);
        }

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
        const route = window.location.hash.replace("#", "");
        if (route === "store-map") {
            renderStoresMap();
        }
        if (route !== "store-detail") {
            destroyStore3DView();
        }
    });

    document.addEventListener("app:product-price-changed", async (ev) => {
        const detail = ev.detail || {};
        if (!storesState.selectedStoreId) return;
        const payload = {
            product: detail.productName || detail.entityId || t("fallback.product"),
            price: detail.newPrice ?? "-",
        };
        pushStoreNotification("price", t("storeNotif.priceTitle"), t("storeNotif.price", payload), detail.timestamp);
        storesState.notifications[0].payload = payload;

        if (window.location.hash.replace("#", "") === "store-detail") {
            await loadStoreDetail(storesState.selectedStoreId);
        }
    });

    document.addEventListener("app:stock-alert", (ev) => {
        const detail = ev.detail || {};
        if (!storesState.selectedStoreId) return;
        const payload = {
            entityId: detail.entityId || t("fallback.inventoryItem"),
            currentStock: detail.currentStock ?? "-",
            shelfStock: detail.shelfStock ?? "-",
        };
        pushStoreNotification("stock", t("storeNotif.stockTitle"), t("storeNotif.stock", payload), detail.timestamp);
        storesState.notifications[0].payload = payload;
    });

    document.addEventListener("app:stores-updated", () => {
        if (window.location.hash.replace("#", "") === "store-map") {
            renderStoresMap();
        }
    });

    document.addEventListener("app:language-changed", () => {
        renderStores();
        if (storesState.selectedStoreId) {
            renderStoreDetail();
        }
        const storeFormTitle = document.getElementById("store-form-title");
        if (storeFormTitle) {
            storeFormTitle.textContent = storesState.editingId ? t("storeForm.editTitle") : t("storeForm.newTitle");
        }
        const shelfFormTitle = document.getElementById("shelf-form-title");
        if (shelfFormTitle) {
            const shelfId = document.getElementById("shelf-id")?.value;
            shelfFormTitle.textContent = shelfId ? t("shelfForm.editTitle") : t("shelfForm.newTitle");
        }
        if (window.location.hash.replace("#", "") === "store-map") {
            renderStoresMap();
        }
    });
});
