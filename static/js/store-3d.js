class Store3DView {
    constructor(containerId, statusId) {
        this.container = document.getElementById(containerId);
        this.statusNode = document.getElementById(statusId);
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.animationId = null;
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.shelves = [];
        this.shelfMeshes = [];
        this.focusIndex = 0;

        this.orbit = {
            target: new THREE.Vector3(0, 1.2, 0),
            radius: 14,
            theta: 0.8,
            phi: 0.9,
        };

        this.dragState = {
            active: false,
            x: 0,
            y: 0,
        };

        this.onResize = this.onResize.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onWheel = this.onWheel.bind(this);
        this.onClick = this.onClick.bind(this);

        if (this.container && typeof THREE !== "undefined") {
            this.initScene();
        }
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color("#f6f7f9");

        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
        this.updateCameraPosition();

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.container.innerHTML = "";
        this.container.appendChild(this.renderer.domElement);

        const ambient = new THREE.AmbientLight(0xffffff, 0.75);
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(8, 12, 6);
        this.scene.add(ambient, dir);

        this.createFloor();
        this.attachEvents();
        this.onResize();
        this.animate();
    }

    createFloor() {
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(40, 40),
            new THREE.MeshStandardMaterial({ color: "#dde4ea", roughness: 0.95 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0;
        this.scene.add(floor);
    }

    parseColor(hex) {
        if (!hex || typeof hex !== "string") return 0x7d8a98;
        if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return 0x7d8a98;
        return parseInt(hex.slice(1), 16);
    }

    makeLabelSprite(text) {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "rgba(21, 40, 52, 0.78)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.font = "20px sans-serif";
        ctx.fillText(text, 10, 38);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(2.8, 0.7, 1);
        return sprite;
    }

    clearSceneShelves() {
        this.shelfMeshes.forEach((entry) => {
            this.scene.remove(entry.group);
        });
        this.shelfMeshes = [];
    }

    buildShelfMesh(shelf, index, total) {
        const cols = Math.max(2, Math.ceil(Math.sqrt(total)));
        const row = Math.floor(index / cols);
        const col = index % cols;
        const spacingX = 6;
        const spacingZ = 6;
        const offsetX = ((cols - 1) * spacingX) / 2;

        const baseX = col * spacingX - offsetX;
        const baseZ = row * spacingZ - 4;

        const group = new THREE.Group();
        group.position.set(baseX, 0, baseZ);

        const frame = new THREE.Mesh(
            new THREE.BoxGeometry(3.2, 2.8, 1.2),
            new THREE.MeshStandardMaterial({ color: "#5c6f7d", roughness: 0.65 })
        );
        frame.position.y = 1.4;
        group.add(frame);

        const shelfFill = Number(shelf.fillPercent || 0);
        const fillColor = shelfFill >= 80 ? 0xc44536 : (shelfFill >= 40 ? 0xc88a16 : 0x2e9f6f);
        const fillIndicator = new THREE.Mesh(
            new THREE.BoxGeometry(3.0 * Math.max(0.05, shelfFill / 100), 0.12, 0.15),
            new THREE.MeshStandardMaterial({ color: fillColor })
        );
        fillIndicator.position.set(-(1.5 - (1.5 * Math.max(0.05, shelfFill / 100))), 0.25, 0.68);
        group.add(fillIndicator);

        const label = this.makeLabelSprite(`${shelf.shelfName || shelf.shelfId} (${shelf.fillCount || 0}/${shelf.maxCapacity || 0})`);
        label.position.set(0, 3.1, 0.6);
        group.add(label);

        const items = Array.isArray(shelf.items) ? shelf.items : [];
        items.slice(0, 8).forEach((item, idx) => {
            const iRow = Math.floor(idx / 4);
            const iCol = idx % 4;
            const productMesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.45, 0.45 + Math.min(0.55, (Number(item.shelfCount || 0) / 20)), 0.45),
                new THREE.MeshStandardMaterial({ color: this.parseColor(item.color), roughness: 0.35, metalness: 0.05 })
            );
            productMesh.position.set(-1.1 + iCol * 0.75, 0.55 + iRow * 0.8, 0.1);
            productMesh.userData = {
                shelfId: shelf.shelfId,
                shelfName: shelf.shelfName,
                productName: item.name,
                stockCount: item.stockCount,
                shelfCount: item.shelfCount,
            };
            group.add(productMesh);
        });

        return group;
    }

    renderStoreInventory(payload) {
        if (!this.scene) return;

        this.clearSceneShelves();
        const shelves = Array.isArray(payload?.shelves) ? payload.shelves : [];
        this.shelves = shelves;
        this.focusIndex = 0;

        shelves.forEach((shelf, idx) => {
            const group = this.buildShelfMesh(shelf, idx, shelves.length);
            group.userData = { shelfId: shelf.shelfId, shelfName: shelf.shelfName };
            this.scene.add(group);
            this.shelfMeshes.push({ shelfId: shelf.shelfId, group });
        });

        if (this.statusNode) {
            const countProducts = shelves.reduce((acc, shelf) => acc + (Array.isArray(shelf.items) ? shelf.items.length : 0), 0);
            this.statusNode.textContent = `Shelves: ${shelves.length} | Products: ${countProducts} | Drag to rotate, wheel to zoom.`;
        }
    }

    updateCameraPosition() {
        const x = this.orbit.target.x + this.orbit.radius * Math.sin(this.orbit.phi) * Math.cos(this.orbit.theta);
        const y = this.orbit.target.y + this.orbit.radius * Math.cos(this.orbit.phi);
        const z = this.orbit.target.z + this.orbit.radius * Math.sin(this.orbit.phi) * Math.sin(this.orbit.theta);
        this.camera.position.set(x, y, z);
        this.camera.lookAt(this.orbit.target);
    }

    resetCamera() {
        this.orbit.radius = 14;
        this.orbit.theta = 0.8;
        this.orbit.phi = 0.9;
        this.orbit.target.set(0, 1.2, 0);
        this.updateCameraPosition();
    }

    focusNextShelf() {
        if (!this.shelfMeshes.length) return;
        this.focusIndex = (this.focusIndex + 1) % this.shelfMeshes.length;
        const next = this.shelfMeshes[this.focusIndex];
        this.orbit.target.set(next.group.position.x, 1.2, next.group.position.z);
        this.updateCameraPosition();
        if (this.statusNode) {
            this.statusNode.textContent = `Focused shelf: ${next.group.userData.shelfName || next.shelfId}`;
        }
    }

    focusShelfById(shelfId) {
        const idx = this.shelfMeshes.findIndex((entry) => entry.shelfId === shelfId);
        if (idx < 0) return;
        this.focusIndex = idx;
        const target = this.shelfMeshes[idx];
        this.orbit.target.set(target.group.position.x, 1.2, target.group.position.z);
        this.updateCameraPosition();
        if (this.statusNode) {
            this.statusNode.textContent = `Focused shelf: ${target.group.userData.shelfName || target.shelfId}`;
        }
    }

    attachEvents() {
        window.addEventListener("resize", this.onResize);
        this.container.addEventListener("pointerdown", this.onPointerDown);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerup", this.onPointerUp);
        this.container.addEventListener("wheel", this.onWheel, { passive: false });
        this.container.addEventListener("click", this.onClick);
    }

    onResize() {
        if (!this.renderer || !this.camera || !this.container) return;
        const width = this.container.clientWidth || 300;
        const height = this.container.clientHeight || 240;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    onPointerDown(event) {
        this.dragState.active = true;
        this.dragState.x = event.clientX;
        this.dragState.y = event.clientY;
    }

    onPointerMove(event) {
        if (!this.dragState.active) return;
        const dx = event.clientX - this.dragState.x;
        const dy = event.clientY - this.dragState.y;
        this.dragState.x = event.clientX;
        this.dragState.y = event.clientY;

        this.orbit.theta -= dx * 0.005;
        this.orbit.phi += dy * 0.005;
        this.orbit.phi = Math.min(Math.max(0.25, this.orbit.phi), Math.PI - 0.25);
        this.updateCameraPosition();
    }

    onPointerUp() {
        this.dragState.active = false;
    }

    onWheel(event) {
        event.preventDefault();
        this.orbit.radius += event.deltaY * 0.012;
        this.orbit.radius = Math.min(Math.max(5, this.orbit.radius), 30);
        this.updateCameraPosition();
    }

    onClick(event) {
        if (!this.renderer || !this.camera) return;
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);

        const meshes = [];
        this.shelfMeshes.forEach((entry) => entry.group.traverse((obj) => {
            if (obj.isMesh) meshes.push(obj);
        }));
        const intersects = this.raycaster.intersectObjects(meshes, false);
        if (!intersects.length) return;

        const picked = intersects[0].object;
        const data = picked.userData || {};
        if (data.productName && this.statusNode) {
            this.statusNode.textContent = `${data.productName} | stock=${data.stockCount ?? "-"} shelf=${data.shelfCount ?? "-"}`;
        }
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        if (!this.renderer || !this.scene || !this.camera) return;
        this.renderer.render(this.scene, this.camera);
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        window.removeEventListener("resize", this.onResize);
        if (this.container) {
            this.container.removeEventListener("pointerdown", this.onPointerDown);
            this.container.removeEventListener("wheel", this.onWheel);
            this.container.removeEventListener("click", this.onClick);
        }
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);

        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement && this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
        }

        this.shelfMeshes = [];
        this.shelves = [];
        this.renderer = null;
        this.camera = null;
        this.scene = null;
    }
}

window.Store3DView = Store3DView;
