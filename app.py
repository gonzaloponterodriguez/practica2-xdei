#!/usr/bin/env python3
"""
Flask-SocketIO server for real-time Orion notifications.
Receives NGSIv2 webhook events from Orion and broadcasts to connected clients.
"""

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import os
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# Enable CORS
CORS(app, resources={r"/*": {"origins": "*"}})

# Initialize Flask-SocketIO
socketio = SocketIO(app, cors_allowed_origins="*")

# Store connected clients count
connected_clients = {}


@app.route('/', methods=['GET'])
def index():
    """Main page - serve the notifications dashboard."""
    return render_template('index.html')


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint for service monitoring."""
    return jsonify({'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()}), 200


@app.route('/webhooks/notifications', methods=['POST'])
def webhook_notifications():
    """
    Webhook endpoint to receive NGSIv2 notifications from Orion.
    Expected payload: NGSIv2 notification format with data array.
    """
    try:
        data = request.get_json()
        
        if not data or not isinstance(data, dict):
            logger.warning("Invalid webhook payload: not a dict")
            return jsonify({'error': 'Invalid payload'}), 400
        
        # Extract subscription data
        subscriptions_data = data.get('data', [])
        if not subscriptions_data:
            logger.warning("No data in webhook payload")
            return jsonify({'error': 'No data field'}), 400
        
        # Process each entity change
        for entity in subscriptions_data:
            entity_type = entity.get('type', '')
            entity_id = entity.get('id', '')
            
            logger.info(f"Processing webhook for {entity_type}:{entity_id}")
            
            # Handle Product price changes
            if entity_type == 'Product':
                price = entity.get('price', {}).get('value')
                product_name = entity.get('name', {}).get('value', entity_id)
                
                event_data = {
                    'entityId': entity_id,
                    'entityType': entity_type,
                    'productName': product_name,
                    'newPrice': price,
                    'timestamp': datetime.utcnow().isoformat()
                }
                
                logger.info(f"Product price event: {product_name} -> {price}")
                # Emit to all connected Socket.IO clients via socketio.server
                socketio.server.emit('product_price_changed', event_data, namespace='/')
                logger.info(f"Broadcasted product_price_changed: {product_name} -> {price}")
            
            # Handle InventoryItem low stock alerts
            elif entity_type == 'InventoryItem':
                stock = entity.get('stock', {}).get('value', 0)
                shelf_stock = entity.get('shelfStock', {}).get('value', 0)
                inventory_item_id = entity_id
                
                # Only emit if stock is critically low
                if stock < 5:
                    event_data = {
                        'entityId': entity_id,
                        'entityType': entity_type,
                        'currentStock': stock,
                        'shelfStock': shelf_stock,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    
                    logger.info(f"Stock alert: {inventory_item_id} stock={stock}")
                    socketio.server.emit('stock_alert', event_data, namespace='/')
                    logger.info(f"Broadcasted stock_alert: {inventory_item_id} stock={stock}")
        
        return jsonify({'status': 'received'}), 200
    
    except Exception as e:
        logger.error(f"Error processing webhook: {str(e)}")
        return jsonify({'error': str(e)}), 500


@socketio.on('connect')
def handle_connect():
    """Handle client connection."""
    client_id = request.sid
    connected_clients[client_id] = {
        'id': client_id,
        'connected_at': datetime.utcnow().isoformat()
    }
    logger.info(f"Client connected: {client_id} (total: {len(connected_clients)})")
    
    # Send connection confirmation with current state
    emit('connection_established', {
        'clientId': client_id,
        'timestamp': datetime.utcnow().isoformat(),
        'message': 'Connected to notifications server'
    })


@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection."""
    client_id = request.sid
    if client_id in connected_clients:
        del connected_clients[client_id]
    logger.info(f"Client disconnected: {client_id} (remaining: {len(connected_clients)})")


@socketio.on('ping')
def handle_ping():
    """Handle ping from client for keepalive."""
    emit('pong', {
        'timestamp': datetime.utcnow().isoformat()
    })


@socketio.on('get_status')
def handle_get_status():
    """Request current server status."""
    emit('server_status', {
        'timestamp': datetime.utcnow().isoformat(),
        'connectedClients': len(connected_clients),
        'uptime': 'running'
    })


if __name__ == '__main__':
    debug = os.environ.get('FLASK_ENV', 'production') == 'development'
    socketio.run(app, host='0.0.0.0', port=5000, debug=debug)
