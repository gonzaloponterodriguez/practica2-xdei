# System Architecture
## Aplicacion FIWARE Gestion Inventario - Practica 2

Version documental: 1.2  
Ultima actualizacion: 2026-04-06

## 1. Vision de alto nivel

Arquitectura web de 3 capas:

1. Frontend SPA ligera servida por Flask.
2. Backend Flask + Flask-SocketIO como API y puente NGSIv2.
3. FIWARE Orion + MongoDB + tutorial provider.

Flujo principal:

- Frontend consume API HTTP del backend.
- Backend proxya operaciones a Orion (NGSIv2).
- Orion notifica cambios al webhook del backend.
- Backend reemite eventos por Socket.IO al frontend.

## 2. Componentes actuales

### 2.1 Frontend

Ubicacion:

- templates/index.html
- static/css/main.css
- static/js/api.js
- static/js/router.js
- static/js/i18n.js
- static/js/products.js
- static/js/employees.js
- static/js/stores.js
- static/js/store-3d.js
- static/js/socket-client.js
- static/js/vendor/three.min.js

Responsabilidades:

- Render de vistas y formularios.
- Navegacion hash route.
- Internacionalizacion ES/EN.
- Tema claro/oscuro persistente.
- Integracion de mapas Leaflet, UML Mermaid y recorrido 3D Three.js.
- Consumo de eventos Socket.IO para actualizaciones real-time.

### 2.2 Backend

Ubicacion:

- app.py

Responsabilidades:

- Exponer endpoints REST usados por frontend.
- Validar payloads y construir entidades/attrs NGSIv2.
- Orquestar consultas agregadas para Product Detail y Store Detail.
- Gestionar webhook de Orion y publicar eventos Socket.IO.
- Registrar providers de contexto externos de forma idempotente al arranque.

### 2.3 Capa de datos y servicios FIWARE

- Orion Context Broker (NGSIv2).
- MongoDB (persistencia Orion).
- Tutorial provider para atributos externos de Store.

## 3. Contratos HTTP actuales

### 3.1 Sistema

- GET /
- GET /health
- POST /webhooks/notifications

### 3.2 Summary

- GET /api/summary

### 3.3 Stores

- GET /api/stores
- GET /api/stores/<entity_id>
- POST /api/stores
- PATCH /api/stores/<entity_id>
- DELETE /api/stores/<entity_id>
- GET /api/stores/<entity_id>/inventory-grouped
- GET /api/stores/<entity_id>/available-products?shelfId=<id>
- POST /api/stores/<entity_id>/shelves
- POST /api/stores/<entity_id>/inventory-items

### 3.4 Shelves

- PATCH /api/shelves/<entity_id>

### 3.5 Inventory items

- POST /api/inventory-items/<entity_id>/buy

### 3.6 Products

- GET /api/products
- POST /api/products
- PATCH /api/products/<entity_id>
- DELETE /api/products/<entity_id>
- GET /api/products/<entity_id>/inventory-grouped
- GET /api/products/<entity_id>/available-shelves?storeId=<id>
- POST /api/products/<entity_id>/inventory-items

### 3.7 Employees

- GET /api/employees
- POST /api/employees
- PATCH /api/employees/<entity_id>
- DELETE /api/employees/<entity_id>

## 4. Eventos Socket.IO actuales

Servidor -> cliente:

- connection_established
- product_price_changed
- stock_alert
- server_status
- pong

Cliente -> servidor:

- ping
- get_status

## 5. Flujo de notificaciones

1. Orion detecta cambio suscrito (price o stockCount).
2. Orion envia POST a /webhooks/notifications.
3. Backend transforma payload NGSIv2 en evento de dominio UI.
4. Backend emite evento Socket.IO a namespace raiz.
5. Frontend actualiza tablas/paneles sin recarga completa.

## 6. Integracion con Orion

### 6.1 Providers de contexto registrados

- weatherConditions para temperature y relativeHumidity.
- catfacts tweets para tweets.

URLs actualmente configuradas:

- http://tutorial:3000/random/weatherConditions
- http://tutorial:3000/catfacts/tweets

### 6.2 Suscripciones usadas

- Product price changes -> webhook backend.
- Low stock alerts en InventoryItem (stockCount < 5) -> webhook backend.

## 7. Modelo de navegacion frontend

Rutas hash soportadas:

- #home
- #products
- #product-detail
- #stores
- #store-detail
- #store-map
- #employees

La seleccion de nav activa se basa en hashchange y mapeo de ruta vista.

## 8. Persistencia de estado de UI

- Idioma (lang) en localStorage.
- Tema (theme) en localStorage.
- Estado de notificaciones y filtros en memoria cliente.

## 9. Validaciones y robustez

Backend valida reglas de dominio en create/update:

- Product: color hex, size permitido, price entero > 0.
- Employee: email, dateOfContract, category, skills, username, password, refStore.
- Store: countryCode, temperatura, humedad, coordenadas y URL.

Respuestas de error normalizadas:

- status
- message
- fieldErrors (cuando aplica)

## 10. Datos iniciales

El script import-data:

- Es compatible con /bin/ash.
- Carga Stores, Employees, Products, Shelves e InventoryItems.
- Registra providers y suscripciones.
- Verifica conteos minimos en Orion y falla si no se cumplen.

## 11. Decisiones tecnicas vigentes

- Three.js se sirve en modo offline-first desde static/js/vendor/three.min.js, con fallback remoto opcional gestionado en frontend.
- Store Detail siempre incluye estanterias vacias para consistencia operativa y visual en tabla y 3D.
- Modo oscuro y i18n se aplican por capa de presentacion sin alterar contratos NGSIv2.
