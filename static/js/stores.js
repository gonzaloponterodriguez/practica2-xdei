const storesState = {
    items: [],
    editingId: null,
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

function setupStoresEvents() {
    document.getElementById("btn-new-store").addEventListener("click", () => openStoreModal());
    document.getElementById("stores-search").addEventListener("input", renderStores);
    document.getElementById("store-form").addEventListener("submit", saveStore);

    document.getElementById("stores-tbody").addEventListener("click", (ev) => {
        const editId = ev.target.getAttribute("data-edit-store");
        const deleteId = ev.target.getAttribute("data-delete-store");

        if (editId) {
            const store = storesState.items.find((item) => item.id === editId);
            if (store) openStoreModal(store);
        }

        if (deleteId) {
            deleteStore(deleteId);
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    setupStoresEvents();
    await loadStoresView();
});
