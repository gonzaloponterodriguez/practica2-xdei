const api = {
    async request(path, options = {}) {
        const response = await fetch(path, {
            headers: { "Content-Type": "application/json" },
            ...options,
        });

        let payload = {};
        try {
            payload = await response.json();
        } catch (err) {
            payload = { status: "error", message: "Invalid JSON response" };
        }

        if (!response.ok) {
            const message = payload.message || "Request failed";
            const error = new Error(message);
            error.details = payload;
            throw error;
        }

        return payload;
    },

    get(path) {
        return this.request(path, { method: "GET" });
    },

    post(path, data) {
        return this.request(path, { method: "POST", body: JSON.stringify(data) });
    },

    patch(path, data) {
        return this.request(path, { method: "PATCH", body: JSON.stringify(data) });
    },

    delete(path) {
        return this.request(path, { method: "DELETE" });
    },
};

function showAlert(message, type = "error") {
    const alert = document.getElementById("global-alert");
    if (!alert) return;

    alert.textContent = message;
    alert.classList.remove("hidden", "alert-error", "alert-success");
    alert.classList.add(type === "success" ? "alert-success" : "alert-error");

    window.clearTimeout(showAlert._timer);
    showAlert._timer = window.setTimeout(() => {
        alert.classList.add("hidden");
    }, 4500);
}

function clearFieldErrors(form) {
    form.querySelectorAll(".field-error").forEach((node) => {
        node.textContent = "";
    });
}

function setFieldError(form, key, value) {
    const isProduct = form.id.startsWith("product");
    const isEmployee = form.id.startsWith("employee");
    const isStore = form.id.startsWith("store");

    const map = {
        name: isProduct ? "product-name" : (isStore ? "store-name" : "employee-name"),
        color: "product-color-text",
        size: "product-size",
        price: "product-price",
        image: isProduct ? "product-image" : (isStore ? "store-image" : "employee-image"),
        email: "employee-email",
        dateOfContract: "employee-date",
        username: "employee-username",
        password: "employee-password",
        category: "employee-category",
        refStore: "employee-store",
        skills: "employee-skills",
        countryCode: "store-countryCode",
        temperature: "store-temperature",
        relativeHumidity: "store-relativeHumidity",
        telephone: "store-telephone",
        url: "store-url",
        capacity: "store-capacity",
        description: "store-description",
        longitude: "store-longitude",
        latitude: "store-latitude",
        location: "store-latitude",
    };

    const fieldId = map[key];
    if (!fieldId) return;
    const target = form.querySelector(`[data-error-for="${fieldId}"]`);
    if (target) target.textContent = value;
}

function closeDialogById(dialogId) {
    const dialog = document.getElementById(dialogId);
    if (dialog && dialog.open) dialog.close();
}

window.appApi = { api, showAlert, clearFieldErrors, setFieldError, closeDialogById };
