const employeesState = {
    items: [],
    stores: [],
    editingId: null,
};

function renderStoresSelect() {
    const select = document.getElementById("employee-store");
    select.innerHTML = '<option value="">Select store</option>' +
        employeesState.stores
            .map((store) => `<option value="${store.id}">${store.name || store.id}</option>`)
            .join("");
}

function filterEmployees(list, term) {
    if (!term) return list;
    const query = term.toLowerCase();
    return list.filter((item) => {
        const hay = `${item.name || ""} ${item.email || ""}`.toLowerCase();
        return hay.includes(query);
    });
}

function skillBadges(skills) {
    if (!Array.isArray(skills)) return "-";
    return skills.map((skill) => `<span class="badge">${skill}</span>`).join(" ");
}

function findStoreName(refStore) {
    const match = employeesState.stores.find((store) => store.id === refStore);
    return match ? match.name || match.id : refStore || "-";
}

function renderEmployees() {
    const tbody = document.getElementById("employees-tbody");
    const empty = document.getElementById("employees-empty");
    const term = document.getElementById("employees-search").value.trim();
    const rows = filterEmployees(employeesState.items, term);

    tbody.innerHTML = rows
        .map((e) => {
            const photo = e.image ? `<img src="${e.image}" class="avatar" alt="${e.name}">` : "<span>-</span>";
            return `<tr>
                <td>${photo}</td>
                <td>${e.name || "-"}</td>
                <td>${e.email || "-"}</td>
                <td>${e.category || "-"}</td>
                <td>${skillBadges(e.skills)}</td>
                <td>${e.username || "-"}</td>
                <td>${findStoreName(e.refStore)}</td>
                <td>${e.dateOfContract || "-"}</td>
                <td>
                    <button class="chip-btn" data-edit-employee="${e.id}">Edit</button>
                    <button class="chip-btn danger" data-delete-employee="${e.id}">Delete</button>
                </td>
            </tr>`;
        })
        .join("");

    empty.style.display = rows.length ? "none" : "block";
}

async function loadEmployees() {
    try {
        const payload = await window.appApi.api.get("/api/employees");
        employeesState.items = payload.data || [];
        renderEmployees();
    } catch (err) {
        window.appApi.showAlert(err.message || "No se pudieron cargar empleados.");
    }
}

async function loadStores() {
    try {
        const payload = await window.appApi.api.get("/api/stores");
        employeesState.stores = payload.data || [];
        renderStoresSelect();
    } catch (err) {
        window.appApi.showAlert(err.message || "No se pudieron cargar tiendas.");
    }
}

document.addEventListener("app:stores-updated", () => {
    loadStores();
});

function openEmployeeModal(editing = null) {
    const dialog = document.getElementById("employee-modal");
    const form = document.getElementById("employee-form");
    window.appApi.clearFieldErrors(form);

    if (editing) {
        employeesState.editingId = editing.id;
        document.getElementById("employee-form-title").textContent = "Edit Employee";
        document.getElementById("employee-id").value = editing.id;
        document.getElementById("employee-name").value = editing.name || "";
        document.getElementById("employee-email").value = editing.email || "";
        document.getElementById("employee-date").value = (editing.dateOfContract || "").slice(0, 10);
        document.getElementById("employee-category").value = editing.category || "";
        document.getElementById("employee-username").value = editing.username || "";
        document.getElementById("employee-password").value = "";
        document.getElementById("employee-store").value = editing.refStore || "";
        document.getElementById("employee-image").value = editing.image || "";
        form.querySelectorAll('input[name="skills"]').forEach((node) => {
            node.checked = Array.isArray(editing.skills) && editing.skills.includes(node.value);
        });
    } else {
        employeesState.editingId = null;
        document.getElementById("employee-form-title").textContent = "New Employee";
        form.reset();
        form.querySelectorAll('input[name="skills"]').forEach((node) => {
            node.checked = false;
        });
    }

    dialog.showModal();
}

function collectEmployeePayload() {
    return {
        name: document.getElementById("employee-name").value.trim(),
        email: document.getElementById("employee-email").value.trim(),
        dateOfContract: document.getElementById("employee-date").value,
        category: document.getElementById("employee-category").value,
        skills: [...document.querySelectorAll('input[name="skills"]:checked')].map((node) => node.value),
        username: document.getElementById("employee-username").value.trim(),
        password: document.getElementById("employee-password").value,
        refStore: document.getElementById("employee-store").value,
        image: document.getElementById("employee-image").value.trim(),
    };
}

function clientValidateEmployee(payload, form, isEditing) {
    let valid = true;
    window.appApi.clearFieldErrors(form);

    if (payload.name.length < 2) {
        window.appApi.setFieldError(form, "name", "Minimo 2 caracteres.");
        valid = false;
    }
    if (!payload.email.includes("@")) {
        window.appApi.setFieldError(form, "email", "Email invalido.");
        valid = false;
    }
    if (!payload.dateOfContract) {
        window.appApi.setFieldError(form, "dateOfContract", "Fecha requerida.");
        valid = false;
    }
    if (!["Manager", "Warehouse", "Sales", "CustomerSupport"].includes(payload.category)) {
        window.appApi.setFieldError(form, "category", "Selecciona una categoria.");
        valid = false;
    }
    if (!payload.skills.length) {
        window.appApi.setFieldError(form, "skills", "Selecciona al menos una skill.");
        valid = false;
    }
    if (!/^[A-Za-z0-9_]+$/.test(payload.username) || payload.username.length < 3) {
        window.appApi.setFieldError(form, "username", "Username invalido.");
        valid = false;
    }
    if (!isEditing && payload.password.length < 8) {
        window.appApi.setFieldError(form, "password", "Password minimo 8 caracteres.");
        valid = false;
    }
    if (!payload.refStore) {
        window.appApi.setFieldError(form, "refStore", "Selecciona una tienda.");
        valid = false;
    }

    return valid;
}

async function saveEmployee(event) {
    event.preventDefault();
    const form = document.getElementById("employee-form");
    const payload = collectEmployeePayload();
    const isEditing = Boolean(employeesState.editingId);

    if (!clientValidateEmployee(payload, form, isEditing)) return;
    if (isEditing && !payload.password) delete payload.password;

    try {
        if (isEditing) {
            await window.appApi.api.patch(`/api/employees/${encodeURIComponent(employeesState.editingId)}`, payload);
            window.appApi.showAlert("Employee updated", "success");
        } else {
            await window.appApi.api.post("/api/employees", payload);
            window.appApi.showAlert("Employee created", "success");
        }
        window.appApi.closeDialogById("employee-modal");
        await loadEmployees();
    } catch (err) {
        const details = err.details || {};
        if (details.fieldErrors) {
            Object.entries(details.fieldErrors).forEach(([k, v]) => window.appApi.setFieldError(form, k, v));
        }
        window.appApi.showAlert(err.message || "Error guardando empleado");
    }
}

async function deleteEmployeeById(entityId) {
    if (!window.confirm("Delete this employee?")) return;
    try {
        await window.appApi.api.delete(`/api/employees/${encodeURIComponent(entityId)}`);
        window.appApi.showAlert("Employee deleted", "success");
        await loadEmployees();
    } catch (err) {
        window.appApi.showAlert(err.message || "No se pudo borrar el empleado.");
    }
}

function setupEmployeesEvents() {
    document.getElementById("btn-new-employee").addEventListener("click", () => openEmployeeModal());
    document.getElementById("employees-search").addEventListener("input", renderEmployees);
    document.getElementById("employee-form").addEventListener("submit", saveEmployee);

    document.getElementById("employees-tbody").addEventListener("click", (ev) => {
        const editId = ev.target.getAttribute("data-edit-employee");
        const deleteId = ev.target.getAttribute("data-delete-employee");

        if (editId) {
            const employee = employeesState.items.find((item) => item.id === editId);
            if (employee) openEmployeeModal(employee);
        }

        if (deleteId) deleteEmployeeById(deleteId);
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    setupEmployeesEvents();
    await loadStores();
    await loadEmployees();
});
