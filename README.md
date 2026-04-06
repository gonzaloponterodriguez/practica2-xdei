# XDEI Práctica 2 - Gestor de Tiendas Retail con FIWARE Orion

Sistema completo de gestión de tiendas retail y productos integrado con FIWARE Orion Context Broker, con notificaciones en tiempo real, soporte multiidioma (ES/EN), tema oscuro, mapas interactivos y visualización 3D de tiendas.

**Stack**: Flask 2.3+ | Flask-SocketIO | FIWARE Orion NGSIv2 | MongoDB | Leaflet.js | Three.js | Mermaid.js

## Características Principales

- **Gestión de Tiendas**: CRUD completo, ubicaciones con geolocalización (Leaflet)
- **Gestión de Productos**: Catálogo con precios, imágenes, disponibilidad
- **Gestión de Empleados**: Perfiles con categoría (Warehouse, Manager, Sales, CustomerSupport)
- **Sistema de Estantes**: Organización jerárquica Store → Shelf → InventoryItem
- **Inventario**: Seguimiento de stock en tiempo real, compra de units
- **Notificaciones en Vivo**: Cambios de precio y alertas de bajo stock vía Socket.IO
- **UI Multiidioma**: Interfaz en ES/EN con soporte a traducción dinámica
- **Tema Oscuro/Claro**: Selector visual con persistencia en localStorage
- **Mapas Interactivos**: Geolocalización de tiendas con Leaflet.js
- **Visualización 3D**: Vistas tridimensionales de tiendas con Three.js
- **Vistas Agregadas**: Productos por tienda, tiendas por producto, filtrado dinámico

## Arquitectura

```
┌─────────────────────┐
│  Cliente Web (SPA)  │ (HTTP + WebSocket)
│ - Vue Router hash   │
│ - Socket.IO client  │
│ - Leaflet + Three.js│
└──────────┬──────────┘
           │
┌──────────▼──────────────────┐
│   Flask-SocketIO Server     │ (Puerto 5000)
│ - 25 HTTP endpoints (CRUD)  │
│ - NGSIv2 proxy a Orion      │
│ - Webhook /webhooks/notify  │
│ - Socket.IO handlers        │
└──────────┬──────────────────┘
           │
┌──────────▼─────────────────────────┐
│  FIWARE Orion (Puerto 1026)         │
│  - 4 entity types (Store, Product, │
│    Employee, InventoryItem)        │
│  - 2 suscripciones + 2 ctx         │
│    providers (Tutorial)            │
└──────────┬─────────────────────────┘
           │
   ┌───────▼────────┐
   │   MongoDB      │
   │  (Puerto 27017)│
   └────────────────┘
```

## Requisitos

- **Docker & Docker Compose** (para FIWARE Orion, MongoDB, Tutorial)
- **Python 3.8+**
- **pip** (gestor de paquetes Python)
- **Git** (para clonar repositorio)

## Instalación

### 1. Clonar el repositorio

```bash
cd /home/gonza/udc/xdei/P2
git clone <repo-url>
cd practica2-xdei
```

### 2. Configurar FIWARE (Orion + MongoDB + Tutorial)

```bash
# Levantar todos los servicios
./services start

# Verificar que Orion está disponible
curl http://localhost:1026/version

# (Opcional) Monitorear logs
docker-compose logs -f
```

**Servicios levantados**:
- `orion-v2` (Context Broker) en puerto 1026
- `mongo-db` (MongoDB) en puerto 27017
- `tutorial` (Context Providers) en puerto 3000

### 3. Cargar datos iniciales en Orion

```bash
# Script compatible con /bin/ash (Alpine)
./import-data

# Verifica que se cargaron correctamente
curl http://localhost:1026/v2/entities | jq '.[] | {id, type}' | head -40
```

**Datos cargados**:
- 4 Stores (cada uno con ubicación, teléfono, capacidad)
- 10 Products (con precios, imágenes, descripciones)
- 4 Employees (categorías: Warehouse, Manager, Sales, CustomerSupport)
- 16 Shelves (4 por tienda)
- 64 InventoryItems (4 por estante)

### 4. Instalar dependencias Python

```bash
# Crear entorno virtual (recomendado)
python3 -m venv venv
source venv/bin/activate      # Linux/macOS
# venv\Scripts\activate        # Windows

# Instalar dependencias
pip install -r requirements.txt
```

## Ejecución

### Desarrollo (con debug)

```bash
# Terminal 1: Asegurar FIWARE levantado
./services start

# Terminal 2: Ejecutar servidor Flask
FLASK_ENV=development python3 app.py
```

**Salida esperada**:
```
 * Serving Flask app 'app'
 * Running on http://0.0.0.0:5000
 * WSGIRequestHandler running in thread 'Thread-1'
 * Debugger is active!
```

Accede a `http://localhost:5000` en el navegador.

### Producción

```bash
FLASK_ENV=production python3 app.py
```

## Validación Inicial

### 1. Health Check

```bash
# Verificar servidor Flask
curl http://localhost:5000/health
# Respuesta: {"status":"healthy","timestamp":"2026-04-06T..."}

# Resumen de entidades
curl http://localhost:5000/api/summary
# Respuesta: {"stores":4,"products":10,"employees":4,"inventoryItems":64}
```

### 2. Verificar Orion y Suscripciones

```bash
# Listar todas las entidades
curl http://localhost:1026/v2/entities | jq '.[] | {id, type}' | head -20

# Verificar suscripciones (debe haber 2)
curl http://localhost:1026/v2/subscriptions | jq '.[].description'
# Respuesta: "Notificaciones de cambios de precios" y "Notificaciones de bajo stock"

# Verificar registros de contexto (debe haber 2)
curl http://localhost:1026/v2/registrations | jq '.[].description'
# Respuesta: "Proveedor de condiciones climáticas" y "Proveedor de tweets"
```

### 3. Visitar la Aplicación Web

Abre en tu navegador:
```
http://localhost:5000
```

Verifica que funcionan:
- ✅ Página carga correctamente (sección Inicio)
- ✅ Selector de idioma (banderas ES/UK) cambia interfaz
- ✅ Selector de tema (☀️/🌙) activa dark mode
- ✅ Navegación entre vistas (Products, Stores, Employees)
- ✅ Mapas de tiendas se cargan (Leaflet)
- ✅ Vistas 3D de tiendas funcionan (Three.js)

## Estructura de Directorios

```
/home/gonza/udc/xdei/P2/practica2-xdei/
├── app.py                          # Servidor Flask-SocketIO (1500+ líneas)
├── requirements.txt                # Dependencias Python
├── README.md                       # Este archivo (v1.1)
├── PRD.md                          # Product Requirements Document (v1.2)
├── architecture.md                 # Documentación técnica (v1.2)
├── data_model.md                   # Modelo de datos NGSIv2 (v1.2)
├── AGENTS.md                       # Reglas de workflow
├── docker-compose.yml              # Orquestación FIWARE
├── services                        # Script de control de servicios Docker
├── import-data                     # Script de carga inicial de datos
├── templates/
│   └── index.html                 # SPA principal (hash routing)
├── static/
│   ├── css/
│   │   └── main.css               # Estilos únicos (light + dark theme)
│   ├── js/
│   │   ├── api.js                 # Cliente HTTP (wrapper fetch)
│   │   ├── router.js              # Hash routing + vistas
│   │   ├── stores.js              # Lógica de tiendas (CRUD + mapa)
│   │   ├── products.js            # Lógica de productos (CRUD)
│   │   ├── employees.js           # Lógica de empleados (CRUD)
│   │   ├── store-3d.js            # Visualización 3D con Three.js
│   │   ├── socket-client.js       # Cliente Socket.IO + notificaciones
│   │   ├── i18n.js                # Multiidioma (ES/EN) + tema
│   │   └── vendor/
│   │       └── three.min.js       # Three.js library
│   └── img/                       # Imágenes estáticas
└── services/                       # Código backend (vacío, todo en app.py)
```

## API HTTP - Endpoints Completos

### Tiendas (Stores)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/stores` | Listar todas las tiendas |
| GET | `/api/stores/<id>` | Obtener detalles de una tienda |
| POST | `/api/stores` | Crear nueva tienda |
| PATCH | `/api/stores/<id>` | Actualizar tienda (parcial) |
| DELETE | `/api/stores/<id>` | Eliminar tienda |
| GET | `/api/stores/<id>/inventory-grouped` | Inventario agrupado por estantes |
| GET | `/api/stores/<id>/available-products` | Productos disponibles para estante (query: `shelfId`) |

**Ejemplo: Crear tienda**

```bash
curl -X POST http://localhost:5000/api/stores \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tienda Centro",
    "address": "Gran Vía 42",
    "location": {
      "type": "Point",
      "coordinates": [-3.716250, 40.415363]
    },
    "telephone": "+34-912-345-678",
    "url": "https://tienda-centro.es",
    "countryCode": "ES",
    "capacity": 500,
    "description": "Tienda matriz en el centro",
    "image": "assets/tienda-centro.jpg"
  }'
```

### Productos (Products)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/products` | Listar todos los productos |
| GET | `/api/products/<id>` | Obtener detalles de un producto |
| POST | `/api/products` | Crear nuevo producto |
| PATCH | `/api/products/<id>` | Actualizar producto (parcial) |
| DELETE | `/api/products/<id>` | Eliminar producto |
| GET | `/api/products/<id>/inventory-grouped` | Inventario agrupado por tiendas |
| GET | `/api/products/<id>/available-shelves` | Estantes disponibles para producto (query: `storeId`) |

**Ejemplo: Cambiar precio de un producto (dispara notificación)**

```bash
# Primero, obtener una entidad Product
PRODUCT_ID=$(curl -s http://localhost:1026/v2/entities?type=Product | jq -r '.[0].id')

# Cambiar su precio en Orion
curl -i -X PUT http://localhost:1026/v2/entities/$PRODUCT_ID/attrs/price \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Integer",
    "value": 2999
  }'
# Respuesta: 204 No Content

# En el navegador (si está conectado): 💲 Cambio de Precio
```

### Empleados (Employees)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/employees` | Listar todos los empleados |
| POST | `/api/employees` | Crear nuevo empleado |
| PATCH | `/api/employees/<id>` | Actualizar empleado (parcial) |
| DELETE | `/api/employees/<id>` | Eliminar empleado |

**Categorías válidas**: `Warehouse`, `Manager`, `Sales`, `CustomerSupport`

### Estantes (Shelves)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/stores/<id>/shelves` | Crear estante en tienda |
| PATCH | `/api/shelves/<id>` | Actualizar estante |

### Inventario (InventoryItems)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/stores/<id>/inventory-items` | Crear item de inventario desde tienda |
| POST | `/api/products/<id>/inventory-items` | Crear item de inventario desde producto |
| POST | `/api/inventory-items/<id>/buy` | Comprar una unidad (decrementa stock) |

**Ejemplo: Comprar una unidad (dispara bajo stock si <5)**

```bash
# Obtener un InventoryItem
ITEM_ID=$(curl -s http://localhost:1026/v2/entities?type=InventoryItem | jq -r '.[0].id')

# Comprar 1 unidad
curl -X POST http://localhost:5000/api/inventory-items/$ITEM_ID/buy \
  -H "Content-Type: application/json" \
  -d '{}'

# Si stockCount < 5: se emite evento "stock_alert" en Socket.IO
```

### Utilidad

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Página principal (SPA) |
| GET | `/health` | Health check del servidor |
| GET | `/api/summary` | Resumen de count de entidades |
| POST | `/webhooks/notifications` | Webhook de Orion (interno) |

## Eventos Socket.IO (Notificaciones en Vivo)

### Servidor → Cliente

| Evento | Descripción | Payload |
|--------|-------------|---------|
| `connection_established` | Confirmación de conexión | `{clientId, timestamp, message}` |
| `product_price_changed` | Cambio de precio de producto | `{entityId, productName, newPrice, timestamp}` |
| `stock_alert` | Stock bajo (<5 unidades) | `{entityId, currentStock, shelfStock, timestamp}` |
| `server_status` | Estado del servidor | `{timestamp, connectedClients, uptime}` |
| `pong` | Respuesta a ping | `{timestamp}` |

### Cliente → Servidor

| Evento | Descripción |
|--------|-------------|
| `ping` | Keepalive (cada 30s) |
| `get_status` | Solicitar estado del servidor |

**Prueba manual en DevTools (F12 → Console)**:

```javascript
// Ver eventos recibidos
window.notificationsClient.notifications   // Array histórico

// Enviar ping
window.notificationsClient.socket.emit('ping');

// Solicitar estado
window.notificationsClient.socket.emit('get_status');
```

## Variables de Entorno

```bash
# Orion Context Broker
ORION_URL=http://localhost:1026
ORION_LIST_LIMIT=1000

# Flask & Socket.IO
FLASK_ENV=development              # o 'production'
FLASK_DEBUG=1                      # Habilita debug (solo desarrollo)
FLASK_PORT=5000
ALLOWED_ORIGINS=http://localhost:5000

# Logging
LOG_LEVEL=INFO
```

**Ejemplo de ejecución con variables**:

```bash
export ORION_URL=http://orion-broker:1026
export FLASK_ENV=production
python3 app.py
```

## Pruebas de Notificaciones en Tiempo Real

### Cambio de Precio

Cuando cambia el `price` de un Product en Orion:

```bash
# 1. Obtener un Product
PROD=$(curl -s http://localhost:1026/v2/entities?type=Product | jq -r '.[0].id')

# 2. Actualizar precio
curl -X PUT http://localhost:1026/v2/entities/$PROD/attrs/price \
  -H "Content-Type: application/json" \
  -d '{"type":"Integer","value":3500}'

# 3. En navegador (conectado a Socket.IO):
#    ✅ Notificación: "💲 Cambio de Precio: [Product]: €3500"
```

### Bajo Stock Alert

Cuando `stockCount < 5` en un InventoryItem:

```bash
# 1. Obtener un InventoryItem
ITEM=$(curl -s http://localhost:1026/v2/entities?type=InventoryItem | jq -r '.[0].id')

# 2. Reducir stock a <5
curl -X PUT http://localhost:1026/v2/entities/$ITEM/attrs/stockCount \
  -H "Content-Type: application/json" \
  -d '{"type":"Integer","value":2}'

# 3. En navegador (conectado a Socket.IO):
#    ✅ Alerta roja: "⚠️ Bajo Stock: Item $ITEM: Stock=2"
```

### Verificación de Orion

```bash
# Ver logs del webhook
docker logs fiware-orion | grep -i "notif delivered" | tail -5

# Debe mostrar líneas como:
# [Notif delivered ... response code: 200]
```

## Funcionalidades Avanzadas

### Multiidioma (ES/EN)

- Selector visual en encabezado (banderas 🇪🇸 🇬🇧)
- Traducciones en `static/js/i18n.js` (líneas 1-500)
- Rutas guardadas automáticamente en localStorage
- Todos los textos UI responden dinámicamente

### Tema Oscuro

- Selector en encabezado (☀️ 🌙)
- CSS variable-based (body[data-theme="dark"])
- Persistencia en localStorage
- Paleta: Light #f5f5f5, Dark #1a1a1a con contraste WCAG AA

### Mapas con Leaflet

- Vista "Stores Map" muestra todas las tiendas georreferenciadas
- Clústers automáticos cuando hay zoom out
- Popups con info de tienda (nombre, teléfono, URL)

### Visualización 3D

- Vista "3D Store" renderiza estantes en tres dimensiones
- Interacción mouse: rotación, zoom, pan
- Legend muestra categorías de color
- Actualización en tiempo real si cambia inventario

## Troubleshooting

### Error: "Port 5000 already in use"

```bash
# Encontrar proceso
lsof -i :5000

# Terminar si es necesario
kill -9 <PID>

# O usar puerto diferente
FLASK_PORT=5001 python3 app.py
```

### Error: "Cannot connect to Orion"

```bash
# Verificar que Orion está levantado
curl http://localhost:1026/version

# Si no responde:
./services start
docker-compose logs orion-v2
```

### Socket.IO no conecta (errores CORS)

En navegador (F12 Developer Console):
```
Cross-Origin Request Blocked
```

**Solución**:
- Asegurar que `ALLOWED_ORIGINS` en app.py incluye `http://localhost:5000`
- Flask debe escuchar en `0.0.0.0` (línea 1505 en app.py)
- Limpiar caché del navegador (Ctrl+Shift+Del)

### Dark mode no aplica correctamente

```bash
# Limpiar localStorage en DevTools (Console)
localStorage.clear()

# Recargar página
location.reload()
```

## Desarrollo

### Agregar nuevo endpoint HTTP

1. Editar `app.py`
2. Crear función con decorador `@app.route()`
3. Validar inputs con función helper `clean_*()` si necesario
4. Llamar a Orion vía `requests` library
5. Retornar JSON o error apropiado

**Ejemplo**:

```python
@app.route("/api/stores/<entity_id>/new-endpoint", methods=["GET"])
def new_endpoint(entity_id):
    store = proxy_orion("GET", f"/v2/entities/{entity_id}")
    if not store:
        return {"error": "Not found"}, 404
    # Lógica
    return {"result": store}, 200
```

### Agregar nuevo evento Socket.IO

1. Editar `app.py` en función `/webhooks/notifications`
2. Detectar cambio en payload de suscripción
3. Emitir evento vía `socketio.emit('event_name', data, broadcast=True)`
4. Editar `static/js/socket-client.js`
5. Agregar listener: `socket.on('event_name', (data) => { ... })`
6. Actualizar UI en listener

### Agregar nueva vista

1. Editar `templates/index.html` (agregar `<div id="view-name">`)
2. Editar `static/js/router.js` (agregar ruta hash y handler)
3. Crear archivo `static/js/view-name.js` con lógica
4. Importar en `index.html` (script tag)
5. Implementar renderizado + event listeners

## Performance & Límites

| Parámetro | Valor | Configurable |
|-----------|-------|---------------|
| Máx. entidades por respuesta | 1000 | `ORION_LIST_LIMIT` |
| Histórico notificaciones | 100 | `socket-client.js` L45 |
| Keepalive ping | 30s | `socket-client.js` L88 |
| Timeout reconexión | 5s | Socket.IO config |
| Max. stores en mapa | 10,000+ | Hardware |

## Seguridad (MVP)

⚠️ **Versión actual MVP - NO INCLUYE**:
- Autenticación (JWT, OAuth)
- Validación de webhook (HMAC, origin check)
- Rate limiting
- HTTPS/WSS
- Sanitización de HTML
- CORS restrictivo

**Para producción** → Abrir issue en GitHub.

## Referencias

- [FIWARE Orion Docs](https://fiware-orion.readthedocs.io/)
- [FFiware NGSIv2 Spec](https://fiware.github.io/specifications/ngsiv2/stable/)
- [Flask-SocketIO](https://flask-socketio.readthedocs.io/)
- [Leaflet.js Maps](https://leafletjs.com/)
- [Three.js 3D](https://threejs.org/)
- [Mermaid UML](https://mermaid.js.org/)

## Licencia

XDEI Práctica 2 - 2026

---

**Versión**: 1.1  
**Última actualización**: 2026-04-06  
**Autor**: XDEI Team
