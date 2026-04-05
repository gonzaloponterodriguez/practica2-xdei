/**
 * Socket.IO Client for real-time Orion notifications
 * Handles connection, events, and UI updates
 */

class NotificationsClient {
    constructor() {
        this.socket = null;
        this.notifications = [];
        this.maxNotifications = 100;
        this.currentFilter = 'all';
        this.messageCount = 0;
        
        this.init();
    }

    init() {
        // Connect to server
        this.socket = io({
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 10,
            // Werkzeug debug server is not a reliable websocket runtime.
            // Polling keeps Socket.IO stable during local development.
            transports: ['polling'],
            upgrade: false
        });

        // Setup event listeners
        this.setupEventListeners();
        this.setupUIListeners();
        
        logger.info('[Client] Initialized');
    }

    setupEventListeners() {
        const t = (key, params) => window.appI18n ? window.appI18n.t(key, params) : key;

        // Connection events
        this.socket.on('connect', () => {
            logger.info('[Socket] Connected');
            this.updateConnectionStatus(true);
            this.socket.emit('get_status');
        });

        this.socket.on('connection_established', (data) => {
            logger.info('[Socket] Connection established:', data);
            document.getElementById('client-id').textContent = data.clientId;
            this.showNotification('success', t('notif.connection.title'), t('notif.connection.message'));
        });

        this.socket.on('disconnect', () => {
            logger.warn('[Socket] Disconnected');
            this.updateConnectionStatus(false);
            this.showNotification('warning', t('notif.disconnected.title'), t('notif.disconnected.message'));
        });

        this.socket.on('connect_error', (error) => {
            logger.error('[Socket] Connection error:', error);
            this.showNotification('error', t('notif.connection.error'), error.message);
        });

        this.socket.on('pong', (data) => {
            logger.debug('[Socket] Pong received:', data);
            document.getElementById('server-time').textContent = window.appI18n
                ? window.appI18n.formatTime(data.timestamp)
                : new Date(data.timestamp).toLocaleTimeString('es-ES');
        });

        // Notification events
        this.socket.on('product_price_changed', (data) => {
            logger.info('[Event] product_price_changed:', data);
            this.addNotification({
                type: 'price',
                title: `💲 ${t('notif.price.title')}`,
                message: t('notif.price.message', { product: data.productName, price: data.newPrice }),
                data: data,
                timestamp: new Date(data.timestamp)
            });
        });

        this.socket.on('stock_alert', (data) => {
            logger.info('[Event] stock_alert:', data);
            this.addNotification({
                type: 'stock',
                title: `⚠️ ${t('notif.stock.title')}`,
                message: t('notif.stock.message', {
                    entityId: data.entityId,
                    currentStock: data.currentStock,
                    shelfStock: data.shelfStock
                }),
                data: data,
                timestamp: new Date(data.timestamp)
            });
        });

        document.addEventListener('app:language-changed', () => {
            this.updateConnectionStatus(!!this.socket?.connected);
            const lastUpdateNode = document.getElementById('last-update');
            if (this.messageCount > 0 && lastUpdateNode?.textContent) {
                lastUpdateNode.textContent = window.appI18n
                    ? window.appI18n.formatTime(new Date())
                    : new Date().toLocaleTimeString('es-ES');
            }
            this.renderNotifications();
        });

        this.socket.on('server_status', (data) => {
            logger.info('[Event] server_status:', data);
            document.getElementById('client-count').textContent = data.connectedClients || 0;
        });

        // Keepalive ping
        this.socket.on('disconnect', () => {
            clearInterval(this.pingInterval);
        });

        this.socket.on('connect', () => {
            this.pingInterval = setInterval(() => {
                this.socket.emit('ping');
            }, 30000); // Ping every 30 seconds
        });
    }

    setupUIListeners() {
        // Filter buttons
        document.getElementById('filter-all').addEventListener('click', (event) => {
            this.setFilter('all', event.currentTarget);
        });

        document.getElementById('filter-price').addEventListener('click', (event) => {
            this.setFilter('price', event.currentTarget);
        });

        document.getElementById('filter-stock').addEventListener('click', (event) => {
            this.setFilter('stock', event.currentTarget);
        });

        // Clear notifications
        document.getElementById('clear-notifications').addEventListener('click', () => {
            this.clearNotifications();
        });

        // Reconnect button
        document.getElementById('reconnect-btn').addEventListener('click', () => {
            if (!this.socket.connected) {
                this.socket.connect();
                logger.info('[UI] Reconnect requested');
            }
        });
    }

    addNotification(notification) {
        this.notifications.unshift(notification);
        
        // Keep only last N notifications
        if (this.notifications.length > this.maxNotifications) {
            this.notifications.pop();
        }

        this.messageCount++;
        document.getElementById('notification-count').textContent = this.messageCount;
        document.getElementById('last-update').textContent = window.appI18n
            ? window.appI18n.formatTime(new Date())
            : new Date().toLocaleTimeString('es-ES');

        this.renderNotifications();

        if (notification.type === 'price') {
            document.dispatchEvent(new CustomEvent('app:product-price-changed', {
                detail: notification.data
            }));
        }

        if (notification.type === 'stock') {
            document.dispatchEvent(new CustomEvent('app:stock-alert', {
                detail: notification.data
            }));
        }
    }

    renderNotifications() {
        const container = document.getElementById('notifications-container');
        const emptyState = document.getElementById('empty-state');
        
        // Filter notifications
        const filtered = this.notifications.filter(n => {
            if (this.currentFilter === 'all') return true;
            return n.type === this.currentFilter;
        });

        // Show/hide empty state
        if (filtered.length === 0) {
            emptyState.style.display = 'block';
            container.innerHTML = '';
            return;
        }

        emptyState.style.display = 'none';

        // Render filtered notifications
        container.innerHTML = filtered.map((n, idx) => `
            <div class="notification-item ${n.type}">
                <div class="notification-header">
                    <span class="notification-title">${n.title}</span>
                    <span class="notification-time">${window.appI18n ? window.appI18n.formatTime(n.timestamp) : n.timestamp.toLocaleTimeString('es-ES')}</span>
                </div>
                <div class="notification-body">
                    <p>${n.message}</p>
                </div>
                <div class="notification-details">
                    <small><strong>${window.appI18n ? window.appI18n.t('notifications.entity') : 'Entity'}:</strong> ${n.data.entityId}</small>
                </div>
            </div>
        `).join('');
    }

    setFilter(filter, targetBtn) {
        this.currentFilter = filter;
        
        // Update active button
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        if (targetBtn) {
            targetBtn.classList.add('active');
        }

        this.renderNotifications();
        logger.info(`[UI] Filter changed to: ${filter}`);
    }

    clearNotifications() {
        this.notifications = [];
        this.messageCount = 0;
        document.getElementById('notification-count').textContent = '0';
        this.renderNotifications();
        logger.info('[UI] Notifications cleared');
    }

    updateConnectionStatus(connected) {
        const statusIcon = document.getElementById('status-icon');
        const statusText = document.getElementById('status-text');
        const websocketStatus = document.getElementById('websocket-status');

        if (connected) {
            statusIcon.classList.remove('disconnected');
            statusIcon.classList.add('connected');
            statusText.textContent = window.appI18n ? window.appI18n.t('status.connected') : 'Conectado';
            websocketStatus.textContent = 'Socket.IO ✓';
            websocketStatus.style.color = '#4CAF50';
        } else {
            statusIcon.classList.remove('connected');
            statusIcon.classList.add('disconnected');
            statusText.textContent = window.appI18n ? window.appI18n.t('status.disconnected') : 'Desconectado';
            websocketStatus.textContent = 'Socket.IO ✗';
            websocketStatus.style.color = '#f44336';
        }
    }

    showNotification(type, title, message) {
        logger.info(`[Notification] ${type}: ${title} - ${message}`);
        // Could be extended to show toast notifications in UI
    }
}

/**
 * Simple Logger for debugging
 */
const logger = {
    info: (msg, data) => {
        console.log(`[INFO] ${msg}`, data || '');
    },
    warn: (msg, data) => {
        console.warn(`[WARN] ${msg}`, data || '');
    },
    error: (msg, data) => {
        console.error(`[ERROR] ${msg}`, data || '');
    },
    debug: (msg, data) => {
        console.debug(`[DEBUG] ${msg}`, data || '');
    }
};

/**
 * Initialize the client when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
    const client = new NotificationsClient();
    window.notificationsClient = client; // Expose for debugging
    logger.info('Notifications client initialized');
});
