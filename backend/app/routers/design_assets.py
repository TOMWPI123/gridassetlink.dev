from __future__ import annotations

import math
import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, cast, or_
from sqlmodel import select

from app.auth.dependencies import SessionDep, require_roles
from app.models import DesignAssetEvent, DesignAssetRecord, DesignAssetType, User
from app.services.audit import model_to_dict

router = APIRouter(prefix="/api/design-assets", tags=["design-assets"])

GEOMETRY_TYPES = {"point", "line", "polygon", "table_only"}
ASSET_TYPE_STATUSES = {"active", "archived"}
RECORD_STATUSES = {"active", "planned", "proposed", "in_review", "as_built", "archived"}
FIELD_TYPES = {"string", "textarea", "number", "integer", "boolean", "date", "enum", "json"}
SLUG_PATTERN = re.compile(r"^[a-z][a-z0-9-]{1,80}$")
FIELD_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


@router.get("/asset-types")
def list_asset_types(
    session: SessionDep,
    status_filter: str | None = Query(default="active", alias="status"),
) -> list[dict[str, Any]]:
    statement = select(DesignAssetType).order_by(DesignAssetType.display_name)
    if status_filter and status_filter != "all":
        statement = statement.where(DesignAssetType.status == status_filter)
    return [_asset_type_dump(row) for row in session.exec(statement).all()]


@router.post("/asset-types", status_code=status.HTTP_201_CREATED)
def create_asset_type(payload: dict[str, Any], session: SessionDep, user: User = Depends(require_roles("admin"))) -> dict[str, Any]:
    data = _normalize_asset_type_payload(payload)
    if session.exec(select(DesignAssetType).where(DesignAssetType.slug == data["slug"])).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Design asset type slug already exists")
    obj = DesignAssetType(**data, created_by=user.id, updated_by=user.id)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    _add_event(session, "asset_type_created", user, asset_type=obj, after=_asset_type_dump(obj))
    session.commit()
    return _asset_type_dump(obj)


@router.get("/asset-types/{slug}")
def get_asset_type(slug: str, session: SessionDep) -> dict[str, Any]:
    obj = _get_asset_type_by_slug(session, slug)
    return _asset_type_dump(obj)


@router.put("/asset-types/{asset_type_id}")
def update_asset_type(asset_type_id: int, payload: dict[str, Any], session: SessionDep, user: User = Depends(require_roles("admin"))) -> dict[str, Any]:
    obj = session.get(DesignAssetType, asset_type_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design asset type not found")
    before = _asset_type_dump(obj)
    data = _normalize_asset_type_payload({**before, **payload}, existing=obj)
    duplicate = session.exec(select(DesignAssetType).where(DesignAssetType.slug == data["slug"], DesignAssetType.id != asset_type_id)).first()
    if duplicate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Design asset type slug already exists")
    for key, value in data.items():
        setattr(obj, key, value)
    obj.version += 1
    obj.updated_at = _utc_now()
    obj.updated_by = user.id
    session.add(obj)
    session.commit()
    session.refresh(obj)
    _add_event(session, "asset_type_updated", user, asset_type=obj, before=before, after=_asset_type_dump(obj))
    session.commit()
    return _asset_type_dump(obj)


@router.delete("/asset-types/{asset_type_id}")
def archive_asset_type(asset_type_id: int, session: SessionDep, user: User = Depends(require_roles("admin"))) -> dict[str, Any]:
    obj = session.get(DesignAssetType, asset_type_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design asset type not found")
    before = _asset_type_dump(obj)
    obj.status = "archived"
    obj.archived_at = _utc_now()
    obj.updated_at = _utc_now()
    obj.updated_by = user.id
    session.add(obj)
    session.commit()
    session.refresh(obj)
    _add_event(session, "asset_type_archived", user, asset_type=obj, before=before, after=_asset_type_dump(obj))
    session.commit()
    return _asset_type_dump(obj)


@router.get("/records")
def list_records(
    session: SessionDep,
    asset_type_slug: str | None = None,
    status_filter: str | None = Query(default="active", alias="status"),
    q: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[dict[str, Any]]:
    statement = select(DesignAssetRecord)
    asset_type: DesignAssetType | None = None
    if asset_type_slug:
        asset_type = _get_asset_type_by_slug(session, asset_type_slug)
        statement = statement.where(DesignAssetRecord.asset_type_id == asset_type.id)
    if status_filter and status_filter != "all":
        statement = statement.where(DesignAssetRecord.status == status_filter)
    if q:
        pattern = f"%{q}%"
        statement = statement.where(or_(DesignAssetRecord.record_key.ilike(pattern), DesignAssetRecord.display_label.ilike(pattern), cast(DesignAssetRecord.properties_json, String).ilike(pattern)))
    records = session.exec(statement.order_by(DesignAssetRecord.updated_at.desc()).offset(offset).limit(limit)).all()
    type_map = _asset_type_map(session, records, asset_type)
    return [_record_dump(record, type_map.get(record.asset_type_id)) for record in records]


@router.post("/records", status_code=status.HTTP_201_CREATED)
def create_record(payload: dict[str, Any], session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor"))) -> dict[str, Any]:
    asset_type = _resolve_asset_type(session, payload)
    data = _normalize_record_payload(payload, asset_type)
    if session.exec(select(DesignAssetRecord).where(DesignAssetRecord.record_key == data["record_key"])).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Design asset record key already exists")
    obj = DesignAssetRecord(**data, asset_type_id=asset_type.id, created_by=user.id, updated_by=user.id)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    dumped = _record_dump(obj, asset_type)
    _add_event(session, "record_created", user, asset_type=asset_type, record=obj, after=dumped)
    session.commit()
    return dumped


@router.get("/records/{record_id}")
def get_record(record_id: int, session: SessionDep) -> dict[str, Any]:
    record = session.get(DesignAssetRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design asset record not found")
    asset_type = session.get(DesignAssetType, record.asset_type_id)
    return _record_dump(record, asset_type)


@router.put("/records/{record_id}")
def update_record(record_id: int, payload: dict[str, Any], session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor"))) -> dict[str, Any]:
    record = session.get(DesignAssetRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design asset record not found")
    asset_type = session.get(DesignAssetType, record.asset_type_id)
    if asset_type is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Design asset record has no valid asset type")
    before = _record_dump(record, asset_type)
    merged_payload = {
        "asset_type_id": asset_type.id,
        "record_key": record.record_key,
        "display_label": record.display_label,
        "geometry": record.geometry_json,
        "properties": record.properties_json,
        "status": record.status,
        "source": record.source,
        "visibility": record.visibility,
        "notes": record.notes,
        **payload,
    }
    data = _normalize_record_payload(merged_payload, asset_type, existing=record)
    duplicate = session.exec(select(DesignAssetRecord).where(DesignAssetRecord.record_key == data["record_key"], DesignAssetRecord.id != record_id)).first()
    if duplicate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Design asset record key already exists")
    for key, value in data.items():
        setattr(record, key, value)
    record.version += 1
    record.updated_at = _utc_now()
    record.updated_by = user.id
    session.add(record)
    session.commit()
    session.refresh(record)
    dumped = _record_dump(record, asset_type)
    _add_event(session, "record_updated", user, asset_type=asset_type, record=record, before=before, after=dumped)
    session.commit()
    return dumped


@router.delete("/records/{record_id}")
def archive_record(record_id: int, session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor"))) -> dict[str, Any]:
    record = session.get(DesignAssetRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design asset record not found")
    asset_type = session.get(DesignAssetType, record.asset_type_id)
    before = _record_dump(record, asset_type)
    record.status = "archived"
    record.archived_at = _utc_now()
    record.updated_at = _utc_now()
    record.updated_by = user.id
    session.add(record)
    session.commit()
    session.refresh(record)
    dumped = _record_dump(record, asset_type)
    _add_event(session, "record_archived", user, asset_type=asset_type, record=record, before=before, after=dumped)
    session.commit()
    return dumped


@router.get("/records/{record_id}/events")
def record_events(record_id: int, session: SessionDep) -> list[dict[str, Any]]:
    events = session.exec(select(DesignAssetEvent).where(DesignAssetEvent.asset_record_id == record_id).order_by(DesignAssetEvent.event_time.desc())).all()
    return [model_to_dict(event) for event in events]


@router.get("/map-records")
def map_records(session: SessionDep) -> dict[str, Any]:
    asset_types = session.exec(select(DesignAssetType).where(DesignAssetType.status == "active").order_by(DesignAssetType.display_name)).all()
    type_map = {row.id: row for row in asset_types if row.id is not None}
    records = session.exec(select(DesignAssetRecord).where(DesignAssetRecord.status != "archived").order_by(DesignAssetRecord.updated_at.desc()).limit(2000)).all()
    visible_records = [record for record in records if record.asset_type_id in type_map]
    dumped_records = [_record_dump(record, type_map.get(record.asset_type_id)) for record in visible_records]
    features = [_record_feature(record, type_map[record.asset_type_id]) for record in visible_records if record.geometry_json]
    return {
        "feature_flag": "NEXT_PUBLIC_ENABLE_MAP_EDITING=true",
        "synthetic_data_notice": "Editable planning assets are demo/planning records only. Do not enter CEII, SCADA, relay/protection, outage, private telecom, or private fiber-route data.",
        "asset_types": [_asset_type_dump(asset_type) for asset_type in asset_types],
        "records": dumped_records,
        "feature_collection": {"type": "FeatureCollection", "features": [feature for feature in features if feature is not None]},
    }


def _normalize_asset_type_payload(payload: dict[str, Any], existing: DesignAssetType | None = None) -> dict[str, Any]:
    slug = str(payload.get("slug") or existing.slug if existing else payload.get("slug") or "").strip().lower()
    if not SLUG_PATTERN.match(slug):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Slug must start with a letter and contain only lowercase letters, numbers, and hyphens")
    display_name = str(payload.get("display_name") or payload.get("displayName") or slug.replace("-", " ").title()).strip()
    geometry_type = str(payload.get("geometry_type") or payload.get("geometryType") or existing.geometry_type if existing else payload.get("geometry_type") or "").strip().lower()
    if geometry_type not in GEOMETRY_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"geometry_type must be one of {sorted(GEOMETRY_TYPES)}")
    fields = _normalize_fields(payload.get("fields") or payload.get("fields_json") or [])
    searchable_fields = _normalize_searchable_fields(payload.get("searchable_fields") or payload.get("searchableFields") or payload.get("searchable_fields_json") or [], fields)
    status_value = str(payload.get("status") or "active").strip().lower()
    if status_value not in ASSET_TYPE_STATUSES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Asset type status must be active or archived")
    return {
        "slug": slug,
        "display_name": display_name,
        "description": payload.get("description"),
        "geometry_type": geometry_type,
        "fields_json": fields,
        "searchable_fields_json": searchable_fields,
        "validation_rules_json": _dict_value(payload.get("validation_rules") or payload.get("validationRules") or payload.get("validation_rules_json") or {}),
        "map_style_json": _dict_value(payload.get("map_style") or payload.get("mapStyle") or payload.get("map_style_json") or {}),
        "status": status_value,
        "notes": payload.get("notes"),
    }


def _normalize_fields(fields: Any) -> list[dict[str, Any]]:
    if not isinstance(fields, list):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="fields must be a list")
    normalized = []
    seen: set[str] = set()
    for raw_field in fields:
        if not isinstance(raw_field, dict):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Each field must be an object")
        name = str(raw_field.get("name") or "").strip()
        if not FIELD_NAME_PATTERN.match(name):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid field name: {name}")
        if name in seen:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Duplicate field name: {name}")
        seen.add(name)
        field_type = str(raw_field.get("type") or "string").strip().lower()
        if field_type not in FIELD_TYPES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid field type for {name}")
        enum_options = raw_field.get("enum_options") or raw_field.get("enumOptions") or raw_field.get("options") or []
        if field_type == "enum" and (not isinstance(enum_options, list) or not enum_options):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Enum field {name} requires options")
        normalized.append(
            {
                "name": name,
                "label": str(raw_field.get("label") or name.replace("_", " ").title()),
                "type": field_type,
                "required": bool(raw_field.get("required", False)),
                "default": raw_field.get("default"),
                "enum_options": [str(option) for option in enum_options],
                "validation_rules": _dict_value(raw_field.get("validation_rules") or raw_field.get("validationRules") or {}),
                "help_text": raw_field.get("help_text") or raw_field.get("helpText"),
            }
        )
    return normalized


def _normalize_searchable_fields(values: Any, fields: list[dict[str, Any]]) -> list[str]:
    field_names = {field["name"] for field in fields}
    if not values:
        return [field["name"] for field in fields if field["type"] in {"string", "textarea", "enum"}][:5]
    if not isinstance(values, list):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="searchable_fields must be a list")
    invalid = [str(value) for value in values if str(value) not in field_names]
    if invalid:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unknown searchable fields: {', '.join(invalid)}")
    return [str(value) for value in values]


def _normalize_record_payload(payload: dict[str, Any], asset_type: DesignAssetType, existing: DesignAssetRecord | None = None) -> dict[str, Any]:
    record_key = str(payload.get("record_key") or payload.get("recordKey") or existing.record_key if existing else payload.get("record_key") or f"{asset_type.slug}-{uuid4().hex[:10]}").strip()
    display_label = str(payload.get("display_label") or payload.get("displayLabel") or payload.get("label") or record_key).strip()
    status_value = str(payload.get("status") or (existing.status if existing else "proposed")).strip().lower()
    if status_value not in RECORD_STATUSES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Record status must be one of {sorted(RECORD_STATUSES)}")
    raw_properties = payload.get("properties") or payload.get("properties_json") or {}
    properties = _validate_properties(_dict_value(raw_properties), asset_type.fields_json or [])
    geometry = _validate_geometry(payload.get("geometry") if "geometry" in payload else payload.get("geometry_json"), asset_type.geometry_type)
    return {
        "record_key": record_key,
        "display_label": display_label,
        "geometry_type": asset_type.geometry_type,
        "geometry_json": geometry,
        "properties_json": properties,
        "status": status_value,
        "source": str(payload.get("source") or (existing.source if existing else "synthetic_demo")),
        "visibility": str(payload.get("visibility") or (existing.visibility if existing else "team")),
        "notes": payload.get("notes"),
    }


def _validate_properties(properties: dict[str, Any], fields: list[dict[str, Any]]) -> dict[str, Any]:
    normalized = dict(properties)
    for field in fields:
        name = field["name"]
        if name not in normalized and field.get("default") is not None:
            normalized[name] = field.get("default")
        value = normalized.get(name)
        if field.get("required") and _is_empty(value):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Missing required field: {name}")
        if _is_empty(value):
            continue
        normalized[name] = _validate_field_value(name, value, field)
    return normalized


def _validate_field_value(name: str, value: Any, field: dict[str, Any]) -> Any:
    field_type = field["type"]
    if field_type in {"string", "textarea", "date"}:
        value = str(value)
    elif field_type == "integer":
        if isinstance(value, bool):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} must be an integer")
        try:
            value = int(value)
        except (TypeError, ValueError) as error:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} must be an integer") from error
    elif field_type == "number":
        if isinstance(value, bool):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} must be a number")
        try:
            value = float(value)
        except (TypeError, ValueError) as error:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} must be a number") from error
    elif field_type == "boolean":
        if not isinstance(value, bool):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} must be true or false")
    elif field_type == "enum":
        value = str(value)
        if value not in set(field.get("enum_options") or []):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} must be one of {field.get('enum_options')}")
    elif field_type == "json" and not isinstance(value, (dict, list)):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} must be JSON object or array")
    return _apply_validation_rules(name, value, field.get("validation_rules") or {})


def _apply_validation_rules(name: str, value: Any, rules: dict[str, Any]) -> Any:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "min" in rules and value < float(rules["min"]):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} is below minimum")
        if "max" in rules and value > float(rules["max"]):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} is above maximum")
    if isinstance(value, str):
        if "min_length" in rules and len(value) < int(rules["min_length"]):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} is shorter than minimum length")
        if "max_length" in rules and len(value) > int(rules["max_length"]):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} is longer than maximum length")
        if rules.get("pattern") and not re.search(str(rules["pattern"]), value):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} does not match required pattern")
    return value


def _validate_geometry(geometry: Any, geometry_type: str) -> dict[str, Any] | None:
    if geometry_type == "table_only":
        return None
    if not isinstance(geometry, dict):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="GeoJSON geometry is required")
    geojson_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if geometry_type == "point":
        if geojson_type != "Point" or not _coordinate(coordinates):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Point asset records require GeoJSON Point geometry")
    elif geometry_type == "line":
        if geojson_type == "LineString":
            if not isinstance(coordinates, list) or len(coordinates) < 2 or any(not _coordinate(item) for item in coordinates):
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Line asset records require at least two coordinates")
        elif geojson_type == "MultiLineString":
            if not isinstance(coordinates, list) or any(not isinstance(line, list) or len(line) < 2 or any(not _coordinate(item) for item in line) for line in coordinates):
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Line asset records require valid MultiLineString coordinates")
        else:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Line asset records require LineString or MultiLineString geometry")
    elif geometry_type == "polygon":
        if geojson_type == "Polygon":
            _validate_polygon_coordinates(coordinates)
        elif geojson_type == "MultiPolygon":
            if not isinstance(coordinates, list) or any(_validate_polygon_coordinates(polygon, raise_errors=False) is False for polygon in coordinates):
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Polygon asset records require valid MultiPolygon coordinates")
        else:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Polygon asset records require Polygon or MultiPolygon geometry")
    return deepcopy(geometry)


def _validate_polygon_coordinates(coordinates: Any, raise_errors: bool = True) -> bool:
    valid = isinstance(coordinates, list) and bool(coordinates)
    if valid:
        for ring in coordinates:
            if not isinstance(ring, list) or len(ring) < 4 or any(not _coordinate(item) for item in ring) or ring[0] != ring[-1]:
                valid = False
                break
    if not valid and raise_errors:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Polygon rings must be closed and contain at least four coordinates")
    return valid


def _coordinate(value: Any) -> bool:
    return isinstance(value, list) and len(value) >= 2 and all(isinstance(item, (int, float)) and math.isfinite(float(item)) for item in value[:2])


def _resolve_asset_type(session: SessionDep, payload: dict[str, Any]) -> DesignAssetType:
    if payload.get("asset_type_id") is not None:
        asset_type = session.get(DesignAssetType, int(payload["asset_type_id"]))
        if asset_type:
            return asset_type
    slug = payload.get("asset_type_slug") or payload.get("assetTypeSlug") or payload.get("asset_type")
    if slug:
        return _get_asset_type_by_slug(session, str(slug))
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="asset_type_slug or asset_type_id is required")


def _get_asset_type_by_slug(session: SessionDep, slug: str) -> DesignAssetType:
    obj = session.exec(select(DesignAssetType).where(DesignAssetType.slug == slug)).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design asset type not found")
    return obj


def _asset_type_map(session: SessionDep, records: list[DesignAssetRecord], known_asset_type: DesignAssetType | None = None) -> dict[int, DesignAssetType]:
    if known_asset_type and known_asset_type.id is not None:
        return {known_asset_type.id: known_asset_type}
    ids = sorted({record.asset_type_id for record in records})
    if not ids:
        return {}
    return {row.id: row for row in session.exec(select(DesignAssetType).where(DesignAssetType.id.in_(ids))).all() if row.id is not None}


def _asset_type_dump(obj: DesignAssetType) -> dict[str, Any]:
    data = model_to_dict(obj)
    data["fields"] = data.get("fields_json") or []
    data["searchable_fields"] = data.get("searchable_fields_json") or []
    data["validation_rules"] = data.get("validation_rules_json") or {}
    data["map_style"] = data.get("map_style_json") or {}
    return data


def _record_dump(record: DesignAssetRecord, asset_type: DesignAssetType | None) -> dict[str, Any]:
    data = model_to_dict(record)
    data["asset_type_slug"] = asset_type.slug if asset_type else None
    data["asset_type_display_name"] = asset_type.display_name if asset_type else None
    data["map_style"] = asset_type.map_style_json if asset_type else {}
    data["properties"] = data.get("properties_json") or {}
    data["geometry"] = data.get("geometry_json")
    return data


def _record_feature(record: DesignAssetRecord, asset_type: DesignAssetType) -> dict[str, Any] | None:
    if not record.geometry_json:
        return None
    return {
        "type": "Feature",
        "properties": {
            "kind": "design_asset_record",
            "id": str(record.id),
            "recordKey": record.record_key,
            "label": record.display_label,
            "status": record.status,
            "assetTypeSlug": asset_type.slug,
            "assetTypeName": asset_type.display_name,
            "geometryType": asset_type.geometry_type,
            "source": record.source,
            "synthetic": record.source == "synthetic_demo",
            "warning": "Editable planning asset. Demo/planning data only; do not enter CEII, SCADA, relay/protection, outage, private telecom, or private fiber-route data.",
        },
        "geometry": record.geometry_json,
    }


def _add_event(
    session: SessionDep,
    event_type: str,
    user: User | None,
    asset_type: DesignAssetType | None = None,
    record: DesignAssetRecord | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    session.add(
        DesignAssetEvent(
            asset_type_id=asset_type.id if asset_type else None,
            asset_record_id=record.id if record else None,
            event_type=event_type,
            actor_user_id=user.id if user else None,
            before_json=before,
            after_json=after,
        )
    )


def _dict_value(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Expected a JSON object")


def _is_empty(value: Any) -> bool:
    return value is None or value == ""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)
