#!/usr/bin/env python3
"""Flask + Socket.IO app with Orion CRUD proxy and real-time notifications."""

from datetime import datetime, timezone
import logging
import os
import re
from typing import Any
from urllib.parse import quote
from uuid import uuid4

import requests
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Flask app setup
app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*")

# Orion config
ORION_URL = os.environ.get("ORION_URL", "http://localhost:1026").rstrip("/")
ORION_HEADERS = {"Accept": "application/json"}

# Runtime state
connected_clients: dict[str, dict[str, Any]] = {}
VALID_SIZES = {"XS", "S", "M", "L", "XL"}
VALID_SKILLS = {"MachineryDriving", "WritingReports", "CustomerRelationships"}
VALID_EMPLOYEE_CATEGORIES = {"Manager", "Warehouse", "Sales", "CustomerSupport"}
USERNAME_RE = re.compile(r"^[A-Za-z0-9_]+$")
HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def utc_iso() -> str:
    """Return timezone-aware UTC timestamp."""
    return datetime.now(timezone.utc).isoformat()


def api_error(message: str, status: int = 400, field_errors: dict[str, str] | None = None):
    payload = {"status": "error", "message": message}
    if field_errors:
        payload["fieldErrors"] = field_errors
    return jsonify(payload), status


def orion_request(method: str, path: str, payload: dict | None = None, params: dict | None = None):
    """Execute request to Orion and return the raw response."""
    url = f"{ORION_URL}{path}"
    headers = dict(ORION_HEADERS)
    if method.upper() in {"POST", "PATCH", "PUT"}:
        headers["Content-Type"] = "application/json"

    response = requests.request(
        method=method,
        url=url,
        headers=headers,
        json=payload,
        params=params,
        timeout=10,
    )
    return response


def sanitize_employee(entity: dict[str, Any]) -> dict[str, Any]:
    """Hide sensitive fields from employee responses."""
    if "password" in entity:
        entity["password"] = "********"
    return entity


def parse_orion_error(response: requests.Response) -> str:
    try:
        body = response.json()
        return body.get("description") or body.get("error") or response.text
    except Exception:
        return response.text or "Unknown Orion error"


def validate_product(data: dict[str, Any], partial: bool = False) -> tuple[bool, dict[str, str]]:
    errors: dict[str, str] = {}
    required_fields = ["name", "color", "size", "price"]

    if not partial:
        for field in required_fields:
            if field not in data:
                errors[field] = "Field is required"

    if "name" in data:
        value = str(data.get("name", "")).strip()
        if len(value) < 2:
            errors["name"] = "Name must have at least 2 characters"

    if "color" in data:
        value = str(data.get("color", "")).strip()
        if not HEX_COLOR_RE.match(value):
            errors["color"] = "Color must be in hexadecimal format #RRGGBB"

    if "size" in data:
        value = str(data.get("size", "")).strip().upper()
        if value not in VALID_SIZES:
            errors["size"] = "Size must be one of XS, S, M, L, XL"

    if "price" in data:
        try:
            price = int(data.get("price"))
            if price < 1:
                errors["price"] = "Price must be greater than 0"
        except (TypeError, ValueError):
            errors["price"] = "Price must be an integer"

    if "image" in data and data.get("image"):
        value = str(data.get("image", "")).strip()
        if not (value.startswith("http://") or value.startswith("https://")):
            errors["image"] = "Image must be a valid URL"

    return len(errors) == 0, errors


def validate_employee(data: dict[str, Any], partial: bool = False) -> tuple[bool, dict[str, str]]:
    errors: dict[str, str] = {}
    required_fields = [
        "name",
        "email",
        "dateOfContract",
        "category",
        "skills",
        "username",
        "refStore",
    ]

    if not partial:
        for field in required_fields:
            if field not in data:
                errors[field] = "Field is required"
        if "password" not in data:
            errors["password"] = "Password is required"

    if "name" in data:
        value = str(data.get("name", "")).strip()
        if len(value) < 2:
            errors["name"] = "Name must have at least 2 characters"

    if "email" in data:
        value = str(data.get("email", "")).strip()
        if "@" not in value or "." not in value.split("@")[-1]:
            errors["email"] = "Email must be valid"

    if "dateOfContract" in data:
        value = str(data.get("dateOfContract", "")).strip()
        if len(value) < 10:
            errors["dateOfContract"] = "Date must use YYYY-MM-DD format"

    if "skills" in data:
        skills = data.get("skills", [])
        if not isinstance(skills, list) or not skills:
            errors["skills"] = "At least one skill is required"
        else:
            invalid = [s for s in skills if s not in VALID_SKILLS]
            if invalid:
                errors["skills"] = "Invalid skills detected"

    if "category" in data:
        value = str(data.get("category", "")).strip()
        if value not in VALID_EMPLOYEE_CATEGORIES:
            errors["category"] = "Invalid category"

    if "username" in data:
        value = str(data.get("username", "")).strip()
        if len(value) < 3:
            errors["username"] = "Username must have at least 3 characters"
        elif not USERNAME_RE.match(value):
            errors["username"] = "Username only supports letters, numbers, and _"

    if "password" in data and data.get("password"):
        value = str(data.get("password", ""))
        if len(value) < 8:
            errors["password"] = "Password must have at least 8 characters"

    if "refStore" in data:
        value = str(data.get("refStore", "")).strip()
        if not value.startswith("urn:ngsi-ld:Store:"):
            errors["refStore"] = "refStore must be a valid Store URN"

    if "image" in data and data.get("image"):
        value = str(data.get("image", "")).strip()
        if not (value.startswith("http://") or value.startswith("https://")):
            errors["image"] = "Image must be a valid URL"

    return len(errors) == 0, errors


def validate_store(data: dict[str, Any], partial: bool = False) -> tuple[bool, dict[str, str]]:
    errors: dict[str, str] = {}
    required_fields = ["name", "countryCode", "temperature", "relativeHumidity"]

    if not partial:
        for field in required_fields:
            if field not in data:
                errors[field] = "Field is required"

    if "name" in data:
        value = str(data.get("name", "")).strip()
        if len(value) < 2:
            errors["name"] = "Name must have at least 2 characters"

    if "countryCode" in data:
        value = str(data.get("countryCode", "")).strip().upper()
        if len(value) != 2:
            errors["countryCode"] = "countryCode must have exactly 2 characters"

    if "temperature" in data:
        try:
            temp = float(data.get("temperature"))
            if temp < -50 or temp > 50:
                errors["temperature"] = "temperature must be between -50 and 50"
        except (TypeError, ValueError):
            errors["temperature"] = "temperature must be numeric"

    if "relativeHumidity" in data:
        try:
            humidity = float(data.get("relativeHumidity"))
            if humidity < 0 or humidity > 100:
                errors["relativeHumidity"] = "relativeHumidity must be between 0 and 100"
        except (TypeError, ValueError):
            errors["relativeHumidity"] = "relativeHumidity must be numeric"

    if "capacity" in data and str(data.get("capacity", "")).strip() != "":
        try:
            capacity = int(data.get("capacity"))
            if capacity < 0:
                errors["capacity"] = "capacity must be >= 0"
        except (TypeError, ValueError):
            errors["capacity"] = "capacity must be an integer"

    if "url" in data and data.get("url"):
        value = str(data.get("url", "")).strip()
        if not (value.startswith("http://") or value.startswith("https://")):
            errors["url"] = "url must be a valid URL"

    if "image" in data and data.get("image"):
        value = str(data.get("image", "")).strip()
        if not (value.startswith("http://") or value.startswith("https://")):
            errors["image"] = "image must be a valid URL"

    return len(errors) == 0, errors


def build_product_entity(data: dict[str, Any], entity_id: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "type": "Product",
        "name": {"type": "Text", "value": str(data["name"]).strip()},
        "color": {"type": "Text", "value": str(data["color"]).strip().upper()},
        "size": {"type": "Text", "value": str(data["size"]).strip().upper()},
        "price": {"type": "Integer", "value": int(data["price"])},
    }
    if entity_id:
        payload["id"] = entity_id
    if data.get("image"):
        payload["image"] = {"type": "URL", "value": str(data["image"]).strip()}
    return payload


def build_product_attrs_for_patch(data: dict[str, Any]) -> dict[str, Any]:
    attrs: dict[str, Any] = {}
    if "name" in data:
        attrs["name"] = {"type": "Text", "value": str(data["name"]).strip()}
    if "color" in data:
        attrs["color"] = {"type": "Text", "value": str(data["color"]).strip().upper()}
    if "size" in data:
        attrs["size"] = {"type": "Text", "value": str(data["size"]).strip().upper()}
    if "price" in data:
        attrs["price"] = {"type": "Integer", "value": int(data["price"])}
    if "image" in data:
        if data.get("image"):
            attrs["image"] = {"type": "URL", "value": str(data["image"]).strip()}
        else:
            attrs["image"] = {"type": "URL", "value": ""}
    return attrs


def build_employee_entity(data: dict[str, Any], entity_id: str | None = None, partial: bool = False) -> dict[str, Any]:
    fields: dict[str, Any] = {}

    if not partial or "name" in data:
        fields["name"] = {"type": "Text", "value": str(data["name"]).strip()}
    if not partial or "email" in data:
        fields["email"] = {"type": "Text", "value": str(data["email"]).strip()}
    if not partial or "dateOfContract" in data:
        fields["dateOfContract"] = {"type": "DateTime", "value": str(data["dateOfContract"]).strip()}
    if not partial or "category" in data:
        fields["category"] = {"type": "Text", "value": str(data["category"]).strip()}
    if not partial or "skills" in data:
        fields["skills"] = {"type": "StructuredValue", "value": data["skills"]}
    if not partial or "username" in data:
        fields["username"] = {"type": "Text", "value": str(data["username"]).strip()}
    if data.get("password"):
        fields["password"] = {"type": "Text", "value": str(data["password"])}
    if not partial or "refStore" in data:
        fields["refStore"] = {"type": "Relationship", "value": str(data["refStore"]).strip()}
    if data.get("image"):
        fields["image"] = {"type": "URL", "value": str(data["image"]).strip()}

    if partial:
        return fields

    entity: dict[str, Any] = {"type": "Employee", **fields}
    if entity_id:
        entity["id"] = entity_id
    return entity


def encode_entity_id(entity_id: str) -> str:
    return quote(entity_id, safe="")


def build_store_entity(data: dict[str, Any], entity_id: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "type": "Store",
        "name": {"type": "Text", "value": str(data["name"]).strip()},
        "countryCode": {"type": "Text", "value": str(data["countryCode"]).strip().upper()},
        "temperature": {"type": "Float", "value": float(data["temperature"])},
        "relativeHumidity": {"type": "Float", "value": float(data["relativeHumidity"])},
    }
    if entity_id:
        payload["id"] = entity_id
    if data.get("url"):
        payload["url"] = {"type": "URL", "value": str(data["url"]).strip()}
    if data.get("telephone"):
        payload["telephone"] = {"type": "Text", "value": str(data["telephone"]).strip()}
    if data.get("capacity") not in (None, ""):
        payload["capacity"] = {"type": "Integer", "value": int(data["capacity"])}
    if data.get("description"):
        payload["description"] = {"type": "Text", "value": str(data["description"]).strip()}
    if data.get("image"):
        payload["image"] = {"type": "URL", "value": str(data["image"]).strip()}
    return payload


def build_store_attrs_for_patch(data: dict[str, Any]) -> dict[str, Any]:
    attrs: dict[str, Any] = {}
    if "name" in data:
        attrs["name"] = {"type": "Text", "value": str(data["name"]).strip()}
    if "countryCode" in data:
        attrs["countryCode"] = {"type": "Text", "value": str(data["countryCode"]).strip().upper()}
    if "temperature" in data:
        attrs["temperature"] = {"type": "Float", "value": float(data["temperature"])}
    if "relativeHumidity" in data:
        attrs["relativeHumidity"] = {"type": "Float", "value": float(data["relativeHumidity"])}
    if "url" in data:
        attrs["url"] = {"type": "URL", "value": str(data.get("url", "")).strip()}
    if "telephone" in data:
        attrs["telephone"] = {"type": "Text", "value": str(data.get("telephone", "")).strip()}
    if "capacity" in data and str(data.get("capacity", "")).strip() != "":
        attrs["capacity"] = {"type": "Integer", "value": int(data["capacity"])}
    if "description" in data:
        attrs["description"] = {"type": "Text", "value": str(data.get("description", "")).strip()}
    if "image" in data:
        attrs["image"] = {"type": "URL", "value": str(data.get("image", "")).strip()}
    return attrs


@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "timestamp": utc_iso()}), 200


@app.route("/api/summary", methods=["GET"])
def get_summary():
    try:
        counts = {}
        for entity_type in ["Store", "Product", "Employee", "InventoryItem"]:
            response = orion_request("GET", "/v2/entities", params={"type": entity_type, "options": "count", "limit": 1})
            if response.status_code >= 400:
                return api_error(parse_orion_error(response), 502)
            counts[entity_type.lower()] = int(response.headers.get("Fiware-Total-Count", 0))
        return jsonify({"status": "ok", "data": counts}), 200
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)


@app.route("/api/stores", methods=["GET"])
def get_stores():
    try:
        response = orion_request("GET", "/v2/entities", params={"type": "Store", "options": "keyValues"})
        if response.status_code >= 400:
            return api_error(parse_orion_error(response), 502)
        return jsonify({"status": "ok", "data": response.json()}), 200
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)


@app.route("/api/stores", methods=["POST"])
def create_store():
    data = request.get_json(silent=True) or {}
    valid, errors = validate_store(data, partial=False)
    if not valid:
        return api_error("Validation error", 400, errors)

    entity_id = str(data.get("id") or f"urn:ngsi-ld:Store:{uuid4().hex[:8]}")
    payload = build_store_entity(data, entity_id=entity_id)

    try:
        response = orion_request("POST", "/v2/entities", payload=payload)
        if response.status_code >= 400:
            status_code = 409 if response.status_code == 422 else response.status_code
            return api_error(parse_orion_error(response), status_code)
        return jsonify({"status": "created", "data": {"id": entity_id}}), 201
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)


@app.route("/api/stores/<path:entity_id>", methods=["PATCH"])
def update_store(entity_id: str):
    data = request.get_json(silent=True) or {}
    valid, errors = validate_store(data, partial=True)
    if not valid:
        return api_error("Validation error", 400, errors)

    payload = build_store_attrs_for_patch(data)
    if not payload:
        return api_error("No valid attributes provided", 400)

    try:
        encoded = encode_entity_id(entity_id)
        response = orion_request("PATCH", f"/v2/entities/{encoded}/attrs", payload=payload)
        if response.status_code >= 400:
            return api_error(parse_orion_error(response), response.status_code)
        return jsonify({"status": "updated", "data": {"id": entity_id}}), 200
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)


@app.route("/api/stores/<path:entity_id>", methods=["DELETE"])
def delete_store(entity_id: str):
    try:
        encoded = encode_entity_id(entity_id)
        response = orion_request("DELETE", f"/v2/entities/{encoded}")
        if response.status_code >= 400:
            return api_error(parse_orion_error(response), response.status_code)
        return jsonify({"status": "deleted", "data": {"id": entity_id}}), 200
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)


@app.route("/api/products", methods=["GET"])
def list_products():
    try:
        response = orion_request("GET", "/v2/entities", params={"type": "Product", "options": "keyValues"})
        if response.status_code >= 400:
            return api_error(parse_orion_error(response), 502)
        return jsonify({"status": "ok", "data": response.json()}), 200
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)


@app.route("/api/products", methods=["POST"])
def create_product():
    data = request.get_json(silent=True) or {}
    valid, errors = validate_product(data, partial=False)
    if not valid:
        return api_error("Validation error", 400, errors)

    entity_id = str(data.get("id") or f"urn:ngsi-ld:Product:{uuid4().hex[:8]}")
    payload = build_product_entity(data, entity_id=entity_id)

    try:
        response = orion_request("POST", "/v2/entities", payload=payload)
        if response.status_code >= 400:
            status_code = 409 if response.status_code == 422 else response.status_code
            return api_error(parse_orion_error(response), status_code)
        return jsonify({"status": "created", "data": {"id": entity_id}}), 201
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)


@app.route("/api/products/<path:entity_id>", methods=["PATCH"])
def update_product(entity_id: str):
    data = request.get_json(silent=True) or {}
    valid, errors = validate_product(data, partial=True)
    if not valid:
        return api_error("Validation error", 400, errors)

    payload = build_product_attrs_for_patch(data)
    if not payload:
        return api_error("No valid attributes provided", 400)

    try:
        encoded = encode_entity_id(entity_id)
        response = orion_request("PATCH", f"/v2/entities/{encoded}/attrs", payload=payload)
        if response.status_code >= 400:
            return api_error(parse_orion_error(response), response.status_code)
        return jsonify({"status": "updated", "data": {"id": entity_id}}), 200
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)


@app.route("/api/products/<path:entity_id>", methods=["DELETE"])
def delete_product(entity_id: str):
    try:
        encoded = encode_entity_id(entity_id)
        response = orion_request("DELETE", f"/v2/entities/{encoded}")
        if response.status_code >= 400:
            return api_error(parse_orion_error(response), response.status_code)
        return jsonify({"status": "deleted", "data": {"id": entity_id}}), 200
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)


@app.route("/api/employees", methods=["GET"])
def list_employees():
    try:
        response = orion_request("GET", "/v2/entities", params={"type": "Employee", "options": "keyValues"})
        if response.status_code >= 400:
            return api_error(parse_orion_error(response), 502)
        employees = [sanitize_employee(e) for e in response.json()]
        return jsonify({"status": "ok", "data": employees}), 200
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)


@app.route("/api/employees", methods=["POST"])
def create_employee():
    data = request.get_json(silent=True) or {}
    valid, errors = validate_employee(data, partial=False)
    if not valid:
        return api_error("Validation error", 400, errors)

    entity_id = str(data.get("id") or f"urn:ngsi-ld:Employee:{uuid4().hex[:8]}")
    payload = build_employee_entity(data, entity_id=entity_id, partial=False)

    try:
        response = orion_request("POST", "/v2/entities", payload=payload)
        if response.status_code >= 400:
            status_code = 409 if response.status_code == 422 else response.status_code
            return api_error(parse_orion_error(response), status_code)
        return jsonify({"status": "created", "data": {"id": entity_id}}), 201
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)


@app.route("/api/employees/<path:entity_id>", methods=["PATCH"])
def update_employee(entity_id: str):
    data = request.get_json(silent=True) or {}
    valid, errors = validate_employee(data, partial=True)
    if not valid:
        return api_error("Validation error", 400, errors)

    payload = build_employee_entity(data, partial=True)

    try:
        encoded = encode_entity_id(entity_id)
        response = orion_request("PATCH", f"/v2/entities/{encoded}/attrs", payload=payload)
        if response.status_code >= 400:
            return api_error(parse_orion_error(response), response.status_code)
        return jsonify({"status": "updated", "data": {"id": entity_id}}), 200
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)


@app.route("/api/employees/<path:entity_id>", methods=["DELETE"])
def delete_employee(entity_id: str):
    try:
        encoded = encode_entity_id(entity_id)
        response = orion_request("DELETE", f"/v2/entities/{encoded}")
        if response.status_code >= 400:
            return api_error(parse_orion_error(response), response.status_code)
        return jsonify({"status": "deleted", "data": {"id": entity_id}}), 200
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)


@app.route("/webhooks/notifications", methods=["POST"])
def webhook_notifications():
    """Receive Orion notifications and broadcast relevant Socket.IO events."""
    try:
        data = request.get_json(silent=True)
        if not data or not isinstance(data, dict):
            return api_error("Invalid payload", 400)

        entities = data.get("data", [])
        if not entities:
            return api_error("No data field", 400)

        for entity in entities:
            entity_type = entity.get("type", "")
            entity_id = entity.get("id", "")

            if entity_type == "Product":
                price = entity.get("price", {}).get("value")
                product_name = entity.get("name", {}).get("value", entity_id)
                event_data = {
                    "entityId": entity_id,
                    "entityType": entity_type,
                    "productName": product_name,
                    "newPrice": price,
                    "timestamp": utc_iso(),
                }
                socketio.server.emit("product_price_changed", event_data, namespace="/")

            elif entity_type == "InventoryItem":
                stock_value = entity.get("stock", {}).get("value")
                if stock_value is None:
                    stock_value = entity.get("stockCount", {}).get("value", 0)
                shelf_value = entity.get("shelfStock", {}).get("value")
                if shelf_value is None:
                    shelf_value = entity.get("shelfCount", {}).get("value", 0)

                if int(stock_value) < 5:
                    event_data = {
                        "entityId": entity_id,
                        "entityType": entity_type,
                        "currentStock": int(stock_value),
                        "shelfStock": int(shelf_value),
                        "timestamp": utc_iso(),
                    }
                    socketio.server.emit("stock_alert", event_data, namespace="/")

        return jsonify({"status": "received"}), 200
    except Exception as exc:
        logger.error("Error processing webhook: %s", str(exc))
        return api_error(str(exc), 500)


@socketio.on("connect")
def handle_connect():
    client_id = request.sid
    connected_clients[client_id] = {"id": client_id, "connected_at": utc_iso()}
    emit(
        "connection_established",
        {
            "clientId": client_id,
            "timestamp": utc_iso(),
            "message": "Connected to notifications server",
        },
    )


@socketio.on("disconnect")
def handle_disconnect():
    client_id = request.sid
    if client_id in connected_clients:
        del connected_clients[client_id]


@socketio.on("ping")
def handle_ping():
    emit("pong", {"timestamp": utc_iso()})


@socketio.on("get_status")
def handle_get_status():
    emit(
        "server_status",
        {
            "timestamp": utc_iso(),
            "connectedClients": len(connected_clients),
            "uptime": "running",
        },
    )


if __name__ == "__main__":
    debug = os.environ.get("FLASK_ENV", "production") == "development"
    socketio.run(app, host="0.0.0.0", port=5000, debug=debug)
