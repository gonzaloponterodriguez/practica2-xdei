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

    if "longitude" in data:
        try:
            longitude = float(data.get("longitude"))
            if longitude < -180 or longitude > 180:
                errors["longitude"] = "longitude must be between -180 and 180"
        except (TypeError, ValueError):
            errors["longitude"] = "longitude must be numeric"

    if "latitude" in data:
        try:
            latitude = float(data.get("latitude"))
            if latitude < -90 or latitude > 90:
                errors["latitude"] = "latitude must be between -90 and 90"
        except (TypeError, ValueError):
            errors["latitude"] = "latitude must be numeric"

    has_lon = "longitude" in data and str(data.get("longitude", "")).strip() != ""
    has_lat = "latitude" in data and str(data.get("latitude", "")).strip() != ""
    if has_lon != has_lat:
        errors["location"] = "longitude and latitude must be provided together"

    return len(errors) == 0, errors


def extract_store_location(data: dict[str, Any]) -> dict[str, Any] | None:
    has_lon = "longitude" in data and str(data.get("longitude", "")).strip() != ""
    has_lat = "latitude" in data and str(data.get("latitude", "")).strip() != ""
    if not (has_lon and has_lat):
        return None
    return {
        "type": "Point",
        "coordinates": [float(data["longitude"]), float(data["latitude"])],
    }


def location_to_lon_lat(location_value: Any) -> dict[str, float] | None:
    if not isinstance(location_value, dict):
        return None
    if location_value.get("type") != "Point":
        return None
    coordinates = location_value.get("coordinates")
    if not isinstance(coordinates, list) or len(coordinates) != 2:
        return None
    try:
        return {
            "longitude": float(coordinates[0]),
            "latitude": float(coordinates[1]),
        }
    except (TypeError, ValueError):
        return None


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


def fetch_entities_key_values(entity_type: str) -> list[dict[str, Any]]:
    response = orion_request("GET", "/v2/entities", params={"type": entity_type, "options": "keyValues"})
    if response.status_code >= 400:
        raise RuntimeError(parse_orion_error(response))
    return response.json()


def fetch_entity_key_values(entity_id: str) -> dict[str, Any]:
    encoded = encode_entity_id(entity_id)
    response = orion_request("GET", f"/v2/entities/{encoded}", params={"options": "keyValues"})
    if response.status_code >= 400:
        raise RuntimeError(parse_orion_error(response))
    return response.json()


def build_shelf_entity(data: dict[str, Any], entity_id: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "type": "Shelf",
        "name": {"type": "Text", "value": str(data["name"]).strip()},
        "maxCapacity": {"type": "Integer", "value": int(data.get("maxCapacity", 100))},
        "refStore": {"type": "Relationship", "value": str(data["refStore"]).strip()},
    }
    if entity_id:
        payload["id"] = entity_id
    if data.get("location"):
        payload["location"] = {"type": "geo:json", "value": data["location"]}
    return payload


def build_shelf_attrs_for_patch(data: dict[str, Any]) -> dict[str, Any]:
    attrs: dict[str, Any] = {}
    if "name" in data:
        attrs["name"] = {"type": "Text", "value": str(data["name"]).strip()}
    if "maxCapacity" in data and str(data.get("maxCapacity", "")).strip() != "":
        attrs["maxCapacity"] = {"type": "Integer", "value": int(data["maxCapacity"])}
    if "location" in data:
        attrs["location"] = {"type": "geo:json", "value": data["location"]}
    return attrs


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
    location = extract_store_location(data)
    if location:
        payload["location"] = {"type": "geo:json", "value": location}
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
    location = extract_store_location(data)
    if location:
        attrs["location"] = {"type": "geo:json", "value": location}
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


@app.route("/api/stores/<path:entity_id>", methods=["GET"])
def get_store(entity_id: str):
    try:
        store = fetch_entity_key_values(entity_id)
        location_data = location_to_lon_lat(store.get("location"))
        payload = dict(store)
        if location_data:
            payload.update(location_data)
        return jsonify({"status": "ok", "data": payload}), 200
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)
    except RuntimeError as exc:
        return api_error(str(exc), 502)


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


@app.route("/api/stores/<path:entity_id>/inventory-grouped", methods=["GET"])
def get_store_inventory_grouped(entity_id: str):
    try:
        store = fetch_entity_key_values(entity_id)
        shelves = fetch_entities_key_values("Shelf")
        products = fetch_entities_key_values("Product")
        inventories = fetch_entities_key_values("InventoryItem")

        store_shelves = [s for s in shelves if s.get("refStore") == entity_id]
        shelf_map = {s.get("id"): s for s in store_shelves}
        product_map = {p.get("id"): p for p in products}

        grouped: dict[str, dict[str, Any]] = {}
        for inv in inventories:
            if inv.get("refStore") != entity_id:
                continue

            shelf_id = inv.get("refShelf")
            if shelf_id not in shelf_map:
                continue

            if shelf_id not in grouped:
                grouped[shelf_id] = {
                    "shelfId": shelf_id,
                    "shelfName": shelf_map[shelf_id].get("name", shelf_id),
                    "maxCapacity": int(shelf_map[shelf_id].get("maxCapacity", 0) or 0),
                    "location": shelf_map[shelf_id].get("location"),
                    "fillCount": 0,
                    "items": [],
                }

            product_id = inv.get("refProduct")
            product = product_map.get(product_id, {})
            stock_count = int(inv.get("stockCount", inv.get("stock", 0) or 0))
            shelf_count = int(inv.get("shelfCount", inv.get("shelfStock", 0) or 0))

            grouped[shelf_id]["fillCount"] += shelf_count
            grouped[shelf_id]["items"].append(
                {
                    "inventoryItemId": inv.get("id"),
                    "productId": product_id,
                    "name": product.get("name", product_id),
                    "image": product.get("image"),
                    "price": product.get("price"),
                    "size": product.get("size"),
                    "color": product.get("color"),
                    "stockCount": stock_count,
                    "shelfCount": shelf_count,
                }
            )

        shelves_out = sorted(grouped.values(), key=lambda x: x["shelfName"])
        for shelf_data in shelves_out:
            shelf_data["items"] = sorted(shelf_data["items"], key=lambda x: x["name"] or "")
            max_capacity = shelf_data.get("maxCapacity", 0)
            shelf_data["fillPercent"] = int((shelf_data["fillCount"] / max_capacity) * 100) if max_capacity > 0 else 0

        payload = {
            "store": {
                "id": store.get("id"),
                "name": store.get("name"),
                "temperature": store.get("temperature"),
                "relativeHumidity": store.get("relativeHumidity"),
                "tweets": store.get("tweets", []),
                "image": store.get("image"),
                "location": store.get("location"),
                "address": store.get("address"),
            },
            "shelves": shelves_out,
        }
        location_data = location_to_lon_lat(store.get("location"))
        if location_data:
            payload["store"].update(location_data)
        return jsonify({"status": "ok", "data": payload}), 200
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)
    except RuntimeError as exc:
        return api_error(str(exc), 502)


@app.route("/api/stores/<path:entity_id>/available-products", methods=["GET"])
def get_available_products_for_store_shelf(entity_id: str):
    shelf_id = request.args.get("shelfId", "").strip()
    if not shelf_id:
        return api_error("shelfId query parameter is required", 400)

    try:
        products = fetch_entities_key_values("Product")
        inventories = fetch_entities_key_values("InventoryItem")

        used_product_ids = {
            inv.get("refProduct")
            for inv in inventories
            if inv.get("refStore") == entity_id and inv.get("refShelf") == shelf_id
        }

        available = [
            {"id": p.get("id"), "name": p.get("name", p.get("id"))}
            for p in products
            if p.get("id") not in used_product_ids
        ]
        available = sorted(available, key=lambda x: x["name"])
        return jsonify({"status": "ok", "data": available}), 200
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)
    except RuntimeError as exc:
        return api_error(str(exc), 502)


@app.route("/api/stores/<path:entity_id>/shelves", methods=["POST"])
def create_shelf_for_store(entity_id: str):
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    if len(name) < 2:
        return api_error("Shelf name must have at least 2 characters", 400)

    max_capacity = data.get("maxCapacity", 100)
    try:
        max_capacity = int(max_capacity)
        if max_capacity <= 0:
            return api_error("maxCapacity must be > 0", 400)
    except (TypeError, ValueError):
        return api_error("maxCapacity must be an integer", 400)

    shelf_id = str(data.get("id") or f"urn:ngsi-ld:Shelf:{uuid4().hex[:8]}")
    payload = build_shelf_entity(
        {
            "name": name,
            "maxCapacity": max_capacity,
            "refStore": entity_id,
            "location": data.get("location"),
        },
        entity_id=shelf_id,
    )

    try:
        response = orion_request("POST", "/v2/entities", payload=payload)
        if response.status_code >= 400:
            status_code = 409 if response.status_code == 422 else response.status_code
            return api_error(parse_orion_error(response), status_code)
        return jsonify({"status": "created", "data": {"id": shelf_id}}), 201
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)


@app.route("/api/shelves/<path:entity_id>", methods=["PATCH"])
def update_shelf(entity_id: str):
    data = request.get_json(silent=True) or {}
    payload = build_shelf_attrs_for_patch(data)
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


@app.route("/api/stores/<path:entity_id>/inventory-items", methods=["POST"])
def create_store_inventory_item(entity_id: str):
    data = request.get_json(silent=True) or {}
    ref_shelf = str(data.get("refShelf", "")).strip()
    ref_product = str(data.get("refProduct", "")).strip()
    if not ref_shelf or not ref_product:
        return api_error("refShelf and refProduct are required", 400)

    try:
        shelves = fetch_entities_key_values("Shelf")
        inventories = fetch_entities_key_values("InventoryItem")

        shelf = next((s for s in shelves if s.get("id") == ref_shelf), None)
        if not shelf:
            return api_error("Shelf not found", 404)
        if shelf.get("refStore") != entity_id:
            return api_error("Shelf does not belong to the selected Store", 400)

        duplicate = next(
            (
                item
                for item in inventories
                if item.get("refStore") == entity_id
                and item.get("refShelf") == ref_shelf
                and item.get("refProduct") == ref_product
            ),
            None,
        )
        if duplicate:
            return api_error("InventoryItem already exists for this Store+Shelf+Product", 409)

        shelf_count = int(data.get("shelfCount", 1))
        stock_count = int(data.get("stockCount", shelf_count))
        if shelf_count < 0 or stock_count < 0:
            return api_error("stockCount and shelfCount must be >= 0", 400)

        inventory_id = f"urn:ngsi-ld:InventoryItem:{uuid4().hex[:8]}"
        payload = {
            "id": inventory_id,
            "type": "InventoryItem",
            "refStore": {"type": "Relationship", "value": entity_id},
            "refShelf": {"type": "Relationship", "value": ref_shelf},
            "refProduct": {"type": "Relationship", "value": ref_product},
            "stockCount": {"type": "Integer", "value": stock_count},
            "shelfCount": {"type": "Integer", "value": shelf_count},
        }

        response = orion_request("POST", "/v2/entities", payload=payload)
        if response.status_code >= 400:
            status_code = 409 if response.status_code == 422 else response.status_code
            return api_error(parse_orion_error(response), status_code)

        return jsonify({"status": "created", "data": {"id": inventory_id}}), 201
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)
    except RuntimeError as exc:
        return api_error(str(exc), 502)


@app.route("/api/inventory-items/<path:entity_id>/buy", methods=["POST"])
def buy_inventory_item_unit(entity_id: str):
    try:
        encoded = encode_entity_id(entity_id)
        payload = {
            "shelfCount": {"type": "Integer", "value": {"$inc": -1}},
            "stockCount": {"type": "Integer", "value": {"$inc": -1}},
        }
        response = orion_request("PATCH", f"/v2/entities/{encoded}/attrs", payload=payload)
        if response.status_code >= 400:
            return api_error(parse_orion_error(response), response.status_code)
        return jsonify({"status": "updated", "data": {"id": entity_id}}), 200
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


@app.route("/api/products/<path:entity_id>/inventory-grouped", methods=["GET"])
def get_product_inventory_grouped(entity_id: str):
    try:
        inventories = fetch_entities_key_values("InventoryItem")
        stores = fetch_entities_key_values("Store")
        shelves = fetch_entities_key_values("Shelf")

        filtered = [item for item in inventories if item.get("refProduct") == entity_id]
        store_map = {store.get("id"): store for store in stores}
        shelf_map = {shelf.get("id"): shelf for shelf in shelves}

        grouped: dict[str, dict[str, Any]] = {}
        for item in filtered:
            store_id = item.get("refStore")
            shelf_id = item.get("refShelf")
            if not store_id or not shelf_id:
                continue

            stock_count = int(item.get("stockCount", item.get("stock", 0)))
            shelf_count = int(item.get("shelfCount", item.get("shelfStock", 0)))

            if store_id not in grouped:
                grouped[store_id] = {
                    "storeId": store_id,
                    "storeName": store_map.get(store_id, {}).get("name", store_id),
                    "stockCount": 0,
                    "shelves": [],
                }

            grouped[store_id]["stockCount"] += stock_count
            grouped[store_id]["shelves"].append(
                {
                    "shelfId": shelf_id,
                    "shelfName": shelf_map.get(shelf_id, {}).get("name", shelf_id),
                    "shelfCount": shelf_count,
                }
            )

        grouped_list = sorted(grouped.values(), key=lambda x: x["storeName"])
        for group in grouped_list:
            group["shelves"] = sorted(group["shelves"], key=lambda x: x["shelfName"])

        return jsonify({"status": "ok", "data": {"productId": entity_id, "stores": grouped_list}}), 200
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)
    except RuntimeError as exc:
        return api_error(str(exc), 502)


@app.route("/api/products/<path:entity_id>/available-shelves", methods=["GET"])
def get_available_shelves_for_product(entity_id: str):
    store_id = request.args.get("storeId", "").strip()
    if not store_id:
        return api_error("storeId query parameter is required", 400)

    try:
        shelves = fetch_entities_key_values("Shelf")
        inventories = fetch_entities_key_values("InventoryItem")

        store_shelves = [shelf for shelf in shelves if shelf.get("refStore") == store_id]
        used_shelf_ids = {
            item.get("refShelf")
            for item in inventories
            if item.get("refProduct") == entity_id and item.get("refStore") == store_id
        }

        available = [
            {"id": shelf.get("id"), "name": shelf.get("name", shelf.get("id"))}
            for shelf in store_shelves
            if shelf.get("id") not in used_shelf_ids
        ]

        return jsonify({"status": "ok", "data": available}), 200
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)
    except RuntimeError as exc:
        return api_error(str(exc), 502)


@app.route("/api/products/<path:entity_id>/inventory-items", methods=["POST"])
def create_product_inventory_item(entity_id: str):
    data = request.get_json(silent=True) or {}
    ref_store = str(data.get("refStore", "")).strip()
    ref_shelf = str(data.get("refShelf", "")).strip()
    if not ref_store or not ref_shelf:
        return api_error("refStore and refShelf are required", 400)

    try:
        shelves = fetch_entities_key_values("Shelf")
        inventories = fetch_entities_key_values("InventoryItem")

        shelf = next((s for s in shelves if s.get("id") == ref_shelf), None)
        if not shelf:
            return api_error("Shelf not found", 404)
        if shelf.get("refStore") != ref_store:
            return api_error("Shelf does not belong to the selected Store", 400)

        duplicate = next(
            (
                item
                for item in inventories
                if item.get("refProduct") == entity_id and item.get("refShelf") == ref_shelf
            ),
            None,
        )
        if duplicate:
            return api_error("InventoryItem already exists for this Product and Shelf", 409)

        shelf_count = int(data.get("shelfCount", 1))
        stock_count = int(data.get("stockCount", shelf_count))
        if shelf_count < 0 or stock_count < 0:
            return api_error("stockCount and shelfCount must be >= 0", 400)

        inventory_id = f"urn:ngsi-ld:InventoryItem:{uuid4().hex[:8]}"
        payload = {
            "id": inventory_id,
            "type": "InventoryItem",
            "refStore": {"type": "Relationship", "value": ref_store},
            "refShelf": {"type": "Relationship", "value": ref_shelf},
            "refProduct": {"type": "Relationship", "value": entity_id},
            "stockCount": {"type": "Integer", "value": stock_count},
            "shelfCount": {"type": "Integer", "value": shelf_count},
        }

        response = orion_request("POST", "/v2/entities", payload=payload)
        if response.status_code >= 400:
            status_code = 409 if response.status_code == 422 else response.status_code
            return api_error(parse_orion_error(response), status_code)

        return jsonify({"status": "created", "data": {"id": inventory_id}}), 201
    except requests.RequestException as exc:
        return api_error(f"Orion unavailable: {str(exc)}", 503)
    except RuntimeError as exc:
        return api_error(str(exc), 502)


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
