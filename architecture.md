# System Architecture
## Aplicación FIWARE Gestión Inventario – Práctica 2

**Diagrama de Alto Nivel:**
```
┌─ FRONTEND (localhost:5000) ──────────────────────────────────────┐
│  • HTML5 + CSS3 + JavaScript (Socket.IO)                         │
│  • Vistas: Home, Products, Stores, Employees, Stores Map         │
│  • Dark/Light + ES/EN + Responsive                               │
└─────────────────────────────────────────────────────────────────┘
         ↓ HTTP + WebSocket (SocketIO)
┌─ BACKEND (Flask + Flask-SocketIO) ───────────────────────────────┐
│  • Port: 5000                                                    │
│  • Rutas HTTP para CRUD                                          │
│  • WebSocket listener para cambios Orion                         │
│  • Emite eventos Socket.IO al frontend                           │
└─────────────────────────────────────────────────────────────────┘
         ↓ HTTP (NGSIv2)
┌─ FIWARE ORION (localhost:1026) ──────────────────────────────────┐
│  • Context Broker (NGSIv2)                                       │
│  • Gestión entidades: Employee, Store, Shelf, Product, Item     │
│  • Registra 2 proveedores contexto                               │
│  • Emite notificaciones por cambios de precio/stock              │
└─────────────────────────────────────────────────────────────────┘
    ↓                          ↓
MONGODB                   Tutorial Provider
(BD datos)         (temperature, tweets)
```

---

## 1. Capas de la Aplicación

### 1.1 Capa de Presentación (Frontend)

**Responsabilidades:**
- Renderizar 5 vistas principales
- Capturar input usuario (formularios CRUD)
- Recibir notificaciones Socket.IO y actualizar UI
- Traducción ES/EN
- Tema Dark/Light

**Tecnologías:**
- HTML5 semántico (1 index.html o SPA)
- CSS3 animations, grid, flexbox
- JavaScript Socket.IO cliente
- Leaflet.js (mapas), Three.js (3D), Mermaid (UML)

**Estructura:**
```
frontend/
├── index.html
├── css/
│   ├── main.css
│   ├── dark.css
│   ├── responsive.css
├── js/
│   ├── socket.js (conexión SocketIO)
│   ├── views.js (renderización vistas)
│   ├── translations.js (ES/EN)
│   ├── map.js (Leaflet)
│   ├── 3d.js (Three.js)
```

### 1.2 Capa de Aplicación (Backend)

**Responsabilidades:**
- Rutas HTTP CRUD → Orion
- Escuchar notificaciones Orion (webhooks)
- Emitir eventos Socket.IO
- Gestionar sesiones usuarios
- Validación datos

**Tecnologías:**
- Flask 2.x
- Flask-SocketIO
- requests (HTTP a Orion)
- Flask-CORS

**Rutas principales:**
```
GET/POST   /api/products
GET/POST   /api/stores
GET/POST   /api/employees
GET/POST   /api/shelves
GET/POST   /api/inventory

PATCH      /api/inventory/{id}/buy  (compra)

POST       /api/subscriptions/register (registrar en Orion)
POST       /webhooks/notifications (recibir notificaciones Orion)
```

### 1.3 Capa de Datos (FIWARE + MongoDB)

**Orion Context Broker:**
- Almacena entidades NGSIv2
- Gestiona relaciones (refStore, refShelf, etc)
- Soporta consultas

**MongoDB:**
- BD subyacente de Orion
- Índices en _id.id, _id.type, etc

**Proveedores Contexto:**
- Tutorial (3000): weather conditions, tweets
- Auto-registrados al arrancar aplicación

---

## 2. Flujo de Comunicación

### 2.1 CRUD Elemento Inventario

```
1. Frontend: POST /api/inventory {refProduct, refShelf, ...}
2. Backend: HTTP POST v2/entities a Orion
3. Orion: Almacena en MongoDB
4. Orion: Valida atributos NGSIv2
5. Backend: Responde 201 al frontend
6. Frontend: Actualiza tabla UI
```

### 2.2 Notificación Cambio Precio

```
1. Admin: PATCH /v2/entities/Product:001/attrs {price: 1500}
2. Orion: Detecta cambio (suscripción activa)
3. Orion: POST a /webhooks/notifications (backend)
4. Backend: Parsea NotificationData
5. Backend: Emite Socket.IO "product_price_changed" 
6. Frontend: Recibe evento
7. Frontend: Actualiza elementos con producto en todas vistas
```

### 2.3 Conexión SocketIO

```
1. Frontend: io() conecta a localhost:5000
2. Backend: socket.on conecta cliente
3. Bidireccional: emit/on eventos real-time
4. Desconexión: limpia socket
```

---

## 3. Integraciones FIWARE

### 3.1 Registro en Orion

**Al arrancar aplicación:**

```
// Suscripción 1: Cambio de precio
POST /v2/subscriptions
{
  description: "Product Price Change",
  subject: {conditions: [{type: "Product"}]},
  notification: {
    http: {url: "http://host.docker.internal:5000/webhooks/notifications"}
  }
}

// Suscripción 2: Bajo stock
POST /v2/subscriptions
{
  description: "Low Stock Alert",
  subject: {conditions: [{type: "InventoryItem"}]},
  notification: {
    http: {url: "http://host.docker.internal:5000/webhooks/notifications"}
  }
}

// Proveedor contexto: Weather
POST /v2/registrations
{
  dataProvided: {
    entities: [{type: "Store"}],
    attrs: ["temperature", "relativeHumidity"]
  },
  provider: {
    http: {url: "http://tutorial:3000/proxy/v1/random/weatherConditions"}
  }
}

// Proveedor contexto: Tweets
POST /v2/registrations
{
  dataProvided: {
    entities: [{type: "Store"}],
    attrs: ["tweets"]
  },
  provider: {
    http: {url: "http://tutorial:3000/proxy/v1/catfacts/tweets"}
  }
}
```

### 3.2 Consultas NGSIv2

```
// Listar productos
GET /v2/entities?type=Product

// Obtener tienda específica
GET /v2/entities/urn:ngsi-ld:Store:001

// Comprar unidad (PATCH con $inc)
PATCH /v2/entities/urn:ngsi-ld:InventoryItem:001/attrs
{
  "shelfCount": {"type": "Integer", "value": {"$inc": -1}},
  "stockCount": {"type": "Integer", "value": {"$inc": -1}}
}
```

---

## 4. Notificaciones Real-Time

### 4.1 SocketIO Server-Side (Flask)

```python
from flask_socketio import emit, join_room

@app.route('/webhooks/notifications', methods=['POST'])
def handle_orion_notification():
    data = request.json
    # Parsear NotificationData
    # Emitir según tipo cambio
    if event_type == "price_change":
        socketio.emit('product_price_changed', {...}, broadcast=True)
    elif event_type == "low_stock":
        socketio.emit('low_stock_alert', {...}, broadcast=True)
    return jsonify({"statusCode": 200})

@socketio.on('connect')
def on_connect():
    emit('connected', {'msg': 'Cliente conectado'})
```

### 4.2 SocketIO Client-Side (JS)

```javascript
const socket = io();

socket.on('product_price_changed', (data) => {
    // data: {productId, newPrice}
    updateProductInAllViews(data.productId, data.newPrice);
    showNotification('Precio actualizado');
});

socket.on('low_stock_alert', (data) => {
    // data: {inventoryItemId, newStock, store}
    showNotification(`Stock bajo: ${data.store}`);
});
```

---

## 5. Proveedores Contexto Externo

**Ubicación:** Tutorial Docker container (:3000)

**Endpoints:**
- /proxy/v1/random/weatherConditions → temperature, relativeHumidity aleatorios
- /proxy/v1/catfacts/tweets → tweets aleatorios

**Registro automático** al arrancar (en init.py o main.py):
```python
def register_context_providers():
    # POST /v2/registrations para weather
    # POST /v2/registrations para tweets
```

**Consumo en frontend:**
- Leer atributos temperature/relativeHumidity de Store
- Mostrar iconos coloreados según rango
- Actualizar via notificaciones Socket.IO

---

## 6. Validaciones

### 6.1 Lado Cliente (HTML5 + JS)

```html
<input type="email" name="email" required>
<input type="password" name="password" minlength="8">
<input type="number" name="capacity" min="0" max="10000">
<input type="tel" name="telephone" pattern="+?[0-9]*">
<input type="color" name="color">
```

```javascript
// Validación JS para lógica compleja
function validateProduct(product) {
    if (!product.color.match(/^#[0-9A-F]{6}$/i)) return false;
    if (product.price <= 0) return false;
    return true;
}
```

### 6.2 Lado Servidor (Flask)

```python
@app.route('/api/products', methods=['POST'])
def create_product():
    data = request.json
    # Validar formato color hexadecimal
    # Validar price > 0
    # POST a Orion
    pass
```

---

## 7. Ambiente de Desarrollo

### 7.1 Docker Compose (3 servicios)

```yaml
services:
  orion:
    image: quay.io/fiware/orion:4.1.0
    ports: "1026:1026"
    depends_on: 
      - mongo-db
    
  mongo-db:
    image: mongo:6.0
    ports: "27017:27017"
    
  tutorial:
    image: quay.io/fiware/tutorials.context-provider
    ports: "3000:3000"
    depends_on:
      - orion
```

### 7.2 Variables de Entorno (.env)

```
COMPOSE_PROJECT_NAME=fiware
ORION_PORT=1026
MONGO_DB_PORT=27017
TUTORIAL_APP_PORT=3000
```

### 7.3 Requirements Python

```
Flask==2.3.0
Flask-SocketIO==5.3.0
Flask-CORS==4.0.0
requests==2.31.0
python-socketio==5.9.0
```

---

## 8. Deployment y Escalado

- Desarrollo local: Docker Compose
- Frontend: Servir desde Flask (static/)
- CORS habilitado para desarrollo
- En producción: separar frontend (nginx) / backend (gunicorn + socketio)

---

## 9. Flujo GitHub Flow

1. **Issue creado** con plan de implementación
2. **Rama feature/issue-name** desde main
3. **Commits locales** con cambios
4. **Push a origin** de la rama
5. **Pull Request** para review
6. **Merge a main** tras aprobación
7. **Actualizar PRD/architecture/data_model** tras cada merge

---

## 10. Estado de Implementación del Issue #1

Implementado en la rama `feature/modelo-datos-ampliado`:

- Carga de datos ampliada en `import-data` con modelo NGSIv2 completo.
- 4 `Store` con atributos extendidos (`url`, `telephone`, `countryCode`, `capacity`, `description`, `image`).
- 4 `Employee` (1 por tienda) con nuevos atributos del enunciado.
- 10 `Product` con atributo `color` hexadecimal y `image`.
- 16 `Shelf` (4 por tienda) y 64 `InventoryItem` (>=4 por estanteria).
- 2 registros de proveedores de contexto (`weather/humidity` y `tweets`) para las 4 tiendas.
- 2 suscripciones NGSIv2 con callback a `host.docker.internal`.

---

## 11. Estado de Implementación del Issue #3

Implementado en la rama `feature/notifications-socketio`:

- **Servidor Flask-SocketIO** (`app.py` ~250 líneas):
  - Escucha en puerto 5000 con WebSocket + HTTP polling fallback.
  - Endpoint `/webhooks/notifications` (POST) recibe eventos NGSIv2 de Orion.
  - Mapeo de eventos: `Product.price` → `product_price_changed`, `InventoryItem.stock<5` → `stock_alert`.
  - Emite a todos los clientes conectados Socket.IO.
  - Eventos Socket.IO servidor: `connection_established`, `product_price_changed`, `stock_alert`, `server_status`, `pong`.

- **Cliente Socket.IO** (`static/js/socket-client.js` ~180 líneas):
  - Conexión automática al servidor con auto-reconexión (1-5s, max 10 intentos).
  - Keepalive ping cada 30 segundos.
  - Listeners para eventos del servidor y actualización UI en tiempo real.
  - Filtrado de notificaciones por tipo (todos/precio/stock).
  - Manejo de desconexión y UI estado.

- **Frontend minimo** (`templates/index.html` + `static/css/main.css`):
  - Interfaz responsive con panel de notificaciones.
  - Indicador visual conexión (verde=conectado, rojo=desconectado).
  - Estadísticas: clientes conectados, total notificaciones, última actualización.
  - Notificaciones coloreadas por tipo (amarillo precio, rojo stock).
  - Estilos gradiente, animaciones, scroll infinito en historial.

- **Documentación** (`README.md` + `requirements.txt`):
  - Instrucciones instalación, validación, troubleshooting.
  - Ejemplos curl para disparar eventos manuales.
  - Estructura de directorios y endpoints.
  - Tabla de eventos Socket.IO.

- **Validación end-to-end**:
  - Webhook recibe y procesa eventos de Orion.
  - Suscripciones NGSIv2 activas apuntando a Flask.
  - Cambios en Orion generan eventos en navegador.
  - Cliente reconecta automáticamente tras desconexión.

---

## 12. Estado de Implementación del Issue #5

Implementado en la rama `feature/ui-forms-crud`:

- **Arquitectura frontend multi-vista (SPA ligera con hash router):**
  - Vista `Home` con diagrama UML Mermaid + KPIs de entidades.
  - Vista `Products` con tabla y formularios modal para alta/edición.
  - Vista `Employees` con tabla y formularios modal para alta/edición.
  - Navegación sticky con sección activa y soporte responsive.

- **Capa de API backend en Flask (proxy Orion):**
  - Nuevo endpoint `GET /api/summary` para KPIs.
  - Nuevo endpoint `GET /api/stores` para poblar selector `refStore`.
  - CRUD de productos:
    - `GET /api/products`
    - `POST /api/products`
    - `PATCH /api/products/<id>`
    - `DELETE /api/products/<id>`
  - CRUD de empleados:
    - `GET /api/employees`
    - `POST /api/employees`
    - `PATCH /api/employees/<id>`
    - `DELETE /api/employees/<id>`

- **Validación y robustez:**
  - Validación server-side de `Product` y `Employee` antes de enviar a Orion.
  - Validación client-side (HTML5 + JS) para experiencia inmediata en formularios.
  - Respuesta de error estandarizada (`status`, `message`, `fieldErrors`).

- **Integración con tiempo real existente:**
  - Se mantiene la recepción de webhooks Orion en `/webhooks/notifications`.
  - Los eventos Socket.IO actualizan panel de notificaciones y disparan refresco de productos tras cambios de precio.

- **Componentes frontend añadidos:**
  - `static/js/api.js` (cliente HTTP + utilidades de errores)
  - `static/js/router.js` (enrutado de vistas + tema)
  - `static/js/products.js` (CRUD products)
  - `static/js/employees.js` (CRUD employees)
