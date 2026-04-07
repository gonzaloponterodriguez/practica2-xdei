# Product Requirements Document (PRD)
## Aplicacion FIWARE Mejorada - Practica 2 XDEI

Version: 1.2  
Estado: En desarrollo activo  
Ultima actualizacion: 2026-04-06

## 1. Descripcion general

Aplicacion web de gestion de inventario sobre FIWARE Orion (NGSIv2), con backend Flask/Flask-SocketIO y frontend SPA ligera (hash routes), que ofrece:

- CRUD sobre Product, Employee y Store.
- Operaciones de detalle por Product y por Store.
- Gestion de Shelf e InventoryItem desde Store Detail.
- Notificaciones en tiempo real para cambios de precio y alertas de stock.
- Visualizacion de mapas (Leaflet), diagrama UML (Mermaid) y recorrido 3D por tienda (Three.js).
- Interfaz bilingue ES/EN y tema claro/oscuro persistentes.

## 2. Objetivos del producto

- Mantener sincronizada la UI con Orion sin recarga completa de pagina.
- Permitir operativa completa de inventario por tienda y estanteria.
- Mejorar trazabilidad visual de datos (mapa, 3D, notificaciones).
- Ofrecer experiencia de usuario consistente en ES/EN y light/dark.

## 3. Alcance funcional actual

### 3.1 Vistas y navegacion

La aplicacion incluye las vistas:

- Home
- Products
- Product Detail
- Stores
- Store Detail
- Stores Map
- Employees

Navegacion por hash route y activacion de pestaña segun ruta activa.

### 3.2 Gestion de entidades

- Product: alta, listado, edicion, borrado.
- Employee: alta, listado, edicion, borrado.
- Store: alta, listado, detalle, edicion, borrado.
- Shelf: alta desde Store Detail y edicion por id.
- InventoryItem:
  - alta desde Product Detail (por store+shelf disponibles),
  - alta desde Store Detail (por shelf+product disponible),
  - compra unitaria con decremento atomico de shelfCount y stockCount.

### 3.3 Proyecciones y agregados de lectura

- Resumen global KPI por tipo de entidad.
- Product Detail agrupado por Store y Shelf.
- Store Detail agrupado por Shelf, incluyendo estanterias vacias.
- Calculo de fillCount y fillPercent por estanteria.

### 3.4 Tiempo real

Eventos Orion procesados por webhook backend:

- Product.price -> evento Socket.IO product_price_changed.
- InventoryItem.stockCount < 5 -> evento Socket.IO stock_alert.

Eventos Socket.IO servidor-cliente soportados:

- connection_established
- product_price_changed
- stock_alert
- server_status
- pong

Eventos cliente-servidor soportados:

- ping
- get_status

### 3.5 UI y experiencia

- Modo claro/oscuro persistente (localStorage).
- Idioma ES/EN persistente (localStorage).
- Toggle de tema con icono sol/luna.
- Toggle de idioma con icono de bandera ES/UK.
- Estilos dark mode afinados en Store Detail (tabla agrupada y tarjetas de leyenda 3D).

### 3.6 Visualizacion avanzada

- Home con diagrama UML renderizado en Mermaid.
- Store Detail con:
  - mapa Leaflet de la tienda,
  - recorrido 3D Three.js,
  - leyenda por estanteria con productos y metricas,
  - panel de tweets,
  - panel de notificaciones del store.
- Stores Map global con marcadores por tienda y acceso a detalle.

## 4. Contratos de API (backend actual)

### 4.1 Sistema

- GET / -> index
- GET /health
- POST /webhooks/notifications

### 4.2 Summary

- GET /api/summary

### 4.3 Stores

- GET /api/stores
- GET /api/stores/<entity_id>
- POST /api/stores
- PATCH /api/stores/<entity_id>
- DELETE /api/stores/<entity_id>
- GET /api/stores/<entity_id>/inventory-grouped
- GET /api/stores/<entity_id>/available-products?shelfId=<id>
- POST /api/stores/<entity_id>/shelves
- POST /api/stores/<entity_id>/inventory-items

### 4.4 Shelves

- PATCH /api/shelves/<entity_id>

### 4.5 Inventory items

- POST /api/inventory-items/<entity_id>/buy

### 4.6 Products

- GET /api/products
- POST /api/products
- PATCH /api/products/<entity_id>
- DELETE /api/products/<entity_id>
- GET /api/products/<entity_id>/inventory-grouped
- GET /api/products/<entity_id>/available-shelves?storeId=<id>
- POST /api/products/<entity_id>/inventory-items

### 4.7 Employees

- GET /api/employees
- POST /api/employees
- PATCH /api/employees/<entity_id>
- DELETE /api/employees/<entity_id>

## 5. Integraciones externas

- Orion Context Broker (NGSIv2) en puerto 1026.
- MongoDB como almacenamiento de Orion.
- Tutorial context provider en puerto 3000.

Registros de contexto externos para Store (bootstrap backend + script import-data):

- weatherConditions: temperature, relativeHumidity.
- catfacts tweets: tweets.

Rutas de provider actualmente usadas:

- http://tutorial:3000/random/weatherConditions
- http://tutorial:3000/catfacts/tweets

## 6. Datos iniciales y seed

Script import-data compatible con /bin/ash, con validaciones minimas en Orion:

- >= 4 Store
- >= 4 Employee
- >= 10 Product
- >= 16 Shelf
- >= 64 InventoryItem

Ademas crea suscripciones NGSIv2 para precio y bajo stock.

## 7. Requisitos no funcionales

- Backend Python con Flask + Flask-SocketIO.
- Frontend HTML/CSS/JS sin framework SPA pesado.
- Consistencia visual responsive en desktop y mobile.
- Idempotencia operacional en registro de providers al arranque.
- Errores API normalizados con status, message y fieldErrors cuando aplica.

## 8. Criterios de aceptacion vigentes

- CRUD funcional para Product, Employee y Store.
- Operaciones de Shelf e InventoryItem funcionales desde Store Detail.
- Product Detail y Store Detail agrupados correctamente.
- Notificaciones real-time entregadas de Orion a UI via webhook + Socket.IO.
- ES/EN y light/dark persistentes y aplicados a toda la interfaz principal.
- Documentacion PRD, architecture y data_model sincronizada con codigo actual.
