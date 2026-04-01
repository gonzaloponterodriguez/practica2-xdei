# Product Requirements Document (PRD)
## Aplicación FIWARE Mejorada – Práctica 2 XDEI

**Versión:** 1.0 | **Estado:** En Desarrollo

---

## 1. Descripción General

Mejorar la aplicación de la Práctica 1 integrando **registro y suscripciones NGSIv2**, **notificaciones en tiempo real desde servidor a cliente** mediante WebSockets, y **metodología GitHub Flow** para desarrollo.

Sistema de gestión de inventario inteligente basado en FIWARE para múltiples tiendas, empleados, estanterías y productos con sincronización en tiempo real.

---

## 2. Objetivos

- ✓ Implementar notificaciones real-time (cambio precio, bajo stock)
- ✓ Gestión completa CRUD de 5 entidades FIWARE
- ✓ Experiencia visual inmersiva (mapas 3D, recorrido virtual Three.js)
- ✓ Interfaz bilingüe (Español/Inglés) con temas Dark/Light
- ✓ Integración proveedores contexto externo (temperature, humidity, tweets)
- ✓ Suscripciones y notificaciones NGSIv2 desde Orion

---

## 3. Requisitos Funcionales

### 3.1 Gestión de Entidades (CRUD Completo)

| Entidad | Atributos Nuevos/Modificados | Características |
|---------|------------------------------|-----------------|
| **Employee** | email, dateOfContract, skills[], username, password | 1 por Store, foto con zoom CSS |
| **Store** | url, telephone, countryCode, capacity, description, temperature, relativeHumidity | Ubicación mapa, recorrido 3D, tweets, temp/humedad |
| **Shelf** | Se mantiene (location, maxCapacity, name, refStore) | nivel de llenado barra progreso |
| **Product** | color (hex RGB) | Foto, precio visible en tablas |
| **InventoryItem** | shelfCount, stockCount | Comprar unidad PATCH Orion |

### 3.2 Suscripciones NGSIv2 y Notificaciones

**Cambios suscritos en Orion:**
- Cambio de **price** de Product → actualizar en todas las vistas donde aparece
- **stockCount** bajo de InventoryItem → notificación en vista Store

**Proveedores contexto externo (registro en Orion):**
- Temperature/RelativeHumidity → desde tutorial:3000/proxy/v1/random/weatherConditions
- Tweets → desde tutorial:3000/proxy/v1/catfacts/tweets

### 3.3 Notificaciones Servidor a Cliente

- Flask-SocketIO escucha cambios desde Orion
- Emite eventos Socket.IO al navegador
- Actualiza elementos UI sin recarga de página

### 3.4 Interfaz de Usuario

**Vistas:**
1. **Home** → Diagrama UML entidades (Mermaid renderizado)
2. **Products** → Tabla: imagen, nombre, color, size, precio | Botones: Agregar, Modificar, Borrar
3. **Stores** → 
   - Mapa Leaflet con ubicación
   - Tabla inventario agrupada por Shelf
   - Recorrido 3D con Three.js
   - Temperatura/Humedad con iconos coloreados
   - Tweets con icono X (Twitter)
   - Panel notificaciones
4. **Employees** → Tabla: foto (zoom hover), email, skills, botones
5. **Stores Map** → Mapa global, tarjeta on-hover, click → detalle Store

**Características Globales:**
- Multiidioma toggle (ES/EN)
- Dark/Light mode toggle
- Navbar persistente, resalta sección activa durante scroll
- Validación HTML5 + JavaScript en formularios
- Variedad input types: text, email, password, number, tel, date, color, select, textarea, checkbox, radio
- Tablas compactas con iconos Font Awesome
- Botones de acción en tablas (CRUD)

### 3.5 Datos Iniciales Cargados

- **4 Empleados**: con email, skills, contraseña, asignados a tiendas
- **4 Tiendas**: Berlín (ubicaciones reales), con temperature/humidity
- **4 Estanterías por Tienda** (16 totales)
- **10 Productos**: frutas/verduras con colores, size, price
- **Items Inventario**: mín. 4 productos por estantería distribuidos

---

## 4. Requisitos No Funcionales

### 4.1 Tecnología y Stack

**Backend:**
- Flask 2.x + Flask-SocketIO
- Conexión HTTP a Orion Context Broker (NGSIv2)
- Escucha de webhooks notificaciones Orion
- Port: localhost:5000

**Frontend:**
- HTML5 semántico
- CSS3 (grid, flexbox, animaciones)
- JavaScript vanilla (Socket.IO)
- Librerías UI: Leaflet.js, Three.js, Mermaid.js, Font Awesome

**Datos:**
- MongoDB (gestionado vía Orion)
- Orion Context Broker (NGSIv2) en localhost:1026
- Tutorial context provider en localhost:3000

**DevOps:**
- Docker Compose (3+ contenedores: Orion, MongoDB, Tutorial)
- .env con variables: ORION_PORT, MONGO_PORT, TUTORIAL_PORT
- .gitignore: .venv, __pycache__, *.pyc

### 4.2 Principios de Arquitectura

- **Separación responsabilidades:** Backend (lógica), Frontend (presentación)
- **CSS first:** Usar CSS para estilos/animaciones, JS solo lógica necesaria
- **Minimizar HTML dinámico:** Actualizar atributos elementos existentes, no generar HTML desde JS
- **Real-time ready:** WebSockets anticipados, sin AJAX polling
- **Documentación dinámica:** Actualizar PRD/architecture/data_model tras cada issue completado

### 4.3 Performance y Escalabilidad

- Notificaciones sin bloqueon (async SocketIO)
- Lazy loading tablas grandes
- Caché de datos en cliente
- Respuesta rápida (<500ms) cambios inventario

---

## 5. Datos Iniciales: Script import-data

- Ejecutar desde Docker
- Crear 4 Stores, 4 Employees, 10 Products, 16 Shelves, N InventoryItems
- Registrar 2 proveedores contexto (temperature/humidity, tweets)
- Usar imágenes gratuitas (Unsplash) o generadas (Nano Banana 2)

---

## 6. Criterios de Aceptación

✓ PRD.md, architecture.md, data_model.md completos y específicos  
✓ 5 entidades con atributos definidos  
✓ Suscripciones NGSIv2 especificadas (2 tipos notificaciones)  
✓ Stack técnico documentado completo  
✓ 4 tiendas + datos iniciales definidos  
✓ Vistas de interfaz detalladas  

---

## 7. Métricas de Éxito

- Todas las entidades CRUD implementadas
- 2 suscripciones NGSIv2 funcionando correctamente
- Notificaciones real-time en cliente
- Interfaz multiidioma funcional
- Dark/Light mode funcional
- Mapa Leaflet accesible
- Recorrido 3D con Three.js
- Datos iniciales 100% cargados
- GitHub Flow completamente implementado
