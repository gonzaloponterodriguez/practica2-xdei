# Notificaciones en Tiempo Real - FIWARE Orion + Flask-SocketIO

Sistema de notificaciones en tiempo real que integra FIWARE Orion con Flask-SocketIO para transmitir eventos de cambios en productos y niveles de stock a través de WebSocket.

## Arquitectura

```
Orion Context Broker (Puerto 1026)
        ↓ (NGSIv2 Webhook)
Flask-SocketIO Server (Puerto 5000)
        ↓ (WebSocket)
Cliente Socket.IO (Navegador)
```

## Requisitos

- Docker & Docker Compose (para FIWARE Orion, MongoDB y Tutorial)
- Python 3.8+
- pip (gestor de paquetes Python)

## Instalación

### 1. Clonar el repositorio

```bash
cd /home/pablo/xdei/practica2
```

### 2. Configurar FIWARE (Orion + MongoDB)

```bash
# Levantar los servicios FIWARE
./services start

# Cargar datos iniciales (4 stores, 10 products, 4 employees, 16 shelves, 64 items)
./import-data

# Verificar que Orion está disponible
curl http://localhost:1026/version
```

### 3. Instalar dependencias Python

```bash
# Crear entorno virtual (opcional pero recomendado)
python3 -m venv venv
source venv/bin/activate  # En Windows: venv\Scripts\activate

# Instalar paquetes
pip install -r requirements.txt
```

## Ejecución

### Opción 1: Desarrollo (Debug habilitado)

```bash
# Terminal 1: Asegurar FIWARE levantado
./services start

# Terminal 2: Ejecutar servidor Flask
FLASK_ENV=development python3 app.py
```

La aplicación estará disponible en `http://localhost:5000`

### Opción 2: Producción

```bash
FLASK_ENV=production python3 app.py
```

## Validación

### 1. Verificar servicios FIWARE

```bash
# Orion disponible
curl http://localhost:1026/v2/entities | jq .

# Suscripciones activas (debe haber 2)
curl http://localhost:1026/v2/subscriptions | jq .
```

### 2. Verificar servidor Flask

```bash
# Health check
curl http://localhost:5000/health
# Respuesta esperada: {"status":"healthy","timestamp":"2026-04-01T..."}

# Página principal (abrir en navegador)
http://localhost:5000
```

### 3. Probar notificaciones en tiempo real

#### Cambio de Precio

```bash
# Cambiar precio de un producto
curl -X PATCH http://localhost:1026/v2/entities/urn:ngsi-ld:Product:001/attrs/price \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Integer",
    "value": 150
  }'
```

**Resultado esperado en navegador:** 
- Aparece notificación "💲 Cambio de Precio: Apples: €150"
- Contador "Notificaciones recibidas" aumenta
- Timestamp se actualiza

#### Bajo Stock Alert

```bash
# Cambiar stock de un InventoryItem a nivel crítico (<5)
curl -X PATCH http://localhost:1026/v2/entities/urn:ngsi-ld:InventoryItem:001/attrs/stock \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Integer",
    "value": 2
  }'
```

**Resultado esperado en navegador:**
- Aparece notificación "⚠️ Bajo Stock: Item urn:ngsi-ld:InventoryItem:001: Stock=2 (Estantería=...)"
- La notificación tiene fondo rojo

#### Prueba sin desconectar

```bash
# Realizar varias actualizaciones rápidas
for i in {100..110}; do
  curl -X PATCH http://localhost:1026/v2/entities/urn:ngsi-ld:Product:001/attrs/price \
    -H "Content-Type: application/json" \
    -d "{ \"type\": \"Integer\", \"value\": $i }"
  sleep 1
done
```

### 4. Verificar WebSocket en consola del navegador

Abrir DevTools (F12) → Console:

```javascript
// Ver logs del cliente
notificationsClient
// Información: socket conectado, eventos recibidos, etc.

// Enviar ping manual
notificationsClient.socket.emit('ping');
// Respuesta: pong recibido en consola

// Obtener estado
notificationsClient.socket.emit('get_status');
```

## Estructura de Directorios

```
/home/pablo/xdei/practica2/
├── app.py                      # Servidor Flask-SocketIO principal
├── requirements.txt            # Dependencias Python
├── README.md                   # Este archivo
├── docker-compose.yml          # Servicios FIWARE (Orion, MongoDB, Tutorial)
├── services                    # Script para orchestración de Docker
├── import-data                 # Script para cargar datos iniciales
├── templates/
│   └── index.html             # Interfaz web (conexión y notificaciones)
├── static/
│   ├── js/
│   │   └── socket-client.js   # Cliente Socket.IO
│   └── css/
│       └── main.css           # Estilos responsivos
├── PRD.md                      # Requisitos del producto
├── architecture.md             # Arquitectura técnica
└── data_model.md               # Modelo de datos NGSIv2
```

## Endpoints

### /health
- **Método:** GET
- **Respuesta:** `{"status":"healthy","timestamp":"ISO-8601"}`
- **Código:** 200

### /webhooks/notifications
- **Método:** POST
- **Payload:** NGSIv2 subscription notification (JSON)
- **Respuesta:** `{"status":"received"}` (200) o error (400/500)
- **Descripción:** Recibe eventos de Orion y emite a clientes Socket.IO

### /
- **Método:** GET
- **Respuesta:** HTML con interfaz de notificaciones
- **Socket.IO:** Conecta cliente al servidor

## Eventos Socket.IO

### Servidor → Cliente

| Evento | Descripción | Payload |
|------|-------------|---------|
| `connection_established` | Confirmación de conexión | `{clientId, timestamp, message}` |
| `product_price_changed` | Cambio de precio de producto | `{entityId, productName, newPrice, timestamp}` |
| `stock_alert` | Stock bajo (<5 unidades) | `{entityId, currentStock, shelfStock, timestamp}` |
| `server_status` | Estado del servidor | `{timestamp, connectedClients, uptime}` |
| `pong` | Respuesta a ping | `{timestamp}` |

### Cliente → Servidor

| Evento | Descripción | Payload |
|------|-------------|---------|
| `ping` | Keepalive | - |
| `get_status` | Solicitar estado | - |

## Reconexión Automática

- Socket.IO reintentar cada 1-5 segundos
- Máximo 10 intentos de reconexión
- Fallback a polling si WebSocket no disponible
- Interfaz muestra estado: "Conectado" (verde) / "Desconectado" (rojo)

## Troubleshooting

### Error: `host.docker.internal not resolved`

**Problema:** En Linux, Docker no resuelve `host.docker.internal`

**Solución:** Editar `docker-compose.yml` y agregar a `orion-v2`:

```yaml
services:
  orion-v2:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Luego: `docker-compose down && ./services start`

### Error: `Port 5000 already in use`

```bash
# Encontrar proceso
lsof -i :5000

# Matar proceso (si es necesario)
kill -9 <PID>

# O usar puerto diferente
FLASK_PORT=5001 python3 app.py
```

### Socket.IO no conecta (errores CORS)

**Verificar en consola del navegador:**

```
Cross-Origin Request Blocked: ... (Reason: CORS request did not succeed)
```

**Solución:** Asegurar que Flask se ejecuta en `0.0.0.0:5000` (ver app.py línea 237)

## Desarrollo

### Agregar nueva suscripción en Orion

```bash
curl -X POST http://localhost:1026/v2/subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Mi nueva suscripción",
    "subject": {
      "entities": [{"type": "MyEntity"}]
    },
    "notification": {
      "http": {
        "url": "http://host.docker.internal:5000/webhooks/notifications"
      }
    }
  }'
```

Luego agregar handler en `app.py` en el endpoint `/webhooks/notifications`.

### Agregar nuevo evento de notificación

1. Editar `app.py` en `/webhooks/notifications`
2. Agregar lógica para mapear el evento
3. Emitir con `socketio.emit('my_event', data, broadcast=True)`
4. Editar `static/js/socket-client.js`
5. Agregar listener: `this.socket.on('my_event', (data) => {...})`
6. Renderizar en UI

## Performance

- **Máximo de notificaciones en histórico:** 100 (configurable en `socket-client.js`)
- **Ping keepalive:** 30 segundos
- **Timeout reconexión en cliente:** 5 segundos
- **Transports habilitados:** WebSocket + HTTP polling (fallback)

## Seguridad (MVP)

**Nota:** La versión actual es MVP y NO incluye:
- Autenticación de webhook (validar origen de Orion)
- Validación de firma (HMAC)
- Rate limiting
- Sanitización de HTML en notificaciones
- HTTPS/WSS

**Para producción:** Implementar en issue posterior.

## Referencias

- [FIWARE Orion Documentation](https://fiware-orion.readthedocs.io/)
- [Flask-SocketIO](https://flask-socketio.readthedocs.io/)
- [Socket.IO Client JS](https://socket.io/docs/v4/client-api/)
- [NGSIv2 API](https://fiware.github.io/specifications/ngsiv2/stable/)

## Licencia

XDEI Práctica 2 - 2026
