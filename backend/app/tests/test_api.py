import inspect
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["AUTO_SEED"] = "true"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed.seed import seed_database  # noqa: E402
from app.routers import live_status  # noqa: E402
from app.routers.gis import _extract_geojson_geometry, _is_safe_tile_warm_plan, _like_pattern, _proposed_edit_target, _recursive_trace_sql, _search_target, import_service_territory, validate_service_territory  # noqa: E402
from app.services.gis_vector_tiles import _tile_sql, choose_plan, supported_layers  # noqa: E402
from app.jobs import synthetic_telecom_generation_worker as generation_worker  # noqa: E402
from app.jobs import gis_scale_performance_check  # noqa: E402

seed_database()
client = TestClient(app)


def auth_headers(email: str = "admin@example.com", password: str = "admin123") -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_login_and_dashboard() -> None:
    response = client.get("/api/dashboard/summary", headers=auth_headers())
    assert response.status_code == 200
    assert response.json()["metrics"]
    assert response.json()["recent_work_orders"]


def test_no_account_implementation_guide() -> None:
    dashboard = client.get("/api/dashboard/summary")
    assert dashboard.status_code == 200
    response = client.get("/api/implementation-guide")
    assert response.status_code == 200
    payload = response.json()
    assert payload["no_account_mode"]["enabled"] is True
    assert any("design database" in phase["title"].lower() for phase in payload["fresh_start_phases"])
    markdown = client.get("/api/implementation-guide/markdown")
    assert markdown.status_code == 200
    assert "GridAssetLink Product Implementation Guide" in markdown.text


def test_live_status_topline(monkeypatch) -> None:
    monkeypatch.setattr(
        live_status,
        "_fetch_intel_stock",
        lambda: {
            "symbol": "INTC",
            "name": "Intel Corporation",
            "price": 21.68,
            "change": -0.71,
            "change_percent": -3.17,
            "currency": "USD",
            "status": "live",
            "source": "test",
            "source_url": "https://example.com/intc",
        },
    )
    monkeypatch.setattr(
        live_status,
        "_fetch_nba_postseason_game",
        lambda: {
            "league": "NBA",
            "season_type": "postseason",
            "status": "pre",
            "short_name": "SAS @ NYK",
            "home_team": "New York Knicks",
            "away_team": "San Antonio Spurs",
            "home_score": None,
            "away_score": None,
            "status_detail": "8:30 PM EDT",
            "source": "test",
            "source_url": "https://example.com/nba",
        },
    )
    response = client.get("/api/live-status/topline")
    assert response.status_code == 200
    payload = response.json()
    assert payload["intel"]["symbol"] == "INTC"
    assert payload["intel"]["status"] == "live"
    assert payload["nba"]["season_type"] == "postseason"
    assert payload["nba"]["short_name"] == "SAS @ NYK"
    assert payload["updated_at"]


def test_dashboard_map_payload() -> None:
    response = client.get("/api/dashboard/map", headers=auth_headers())
    assert response.status_code == 200
    payload = response.json()
    assert payload["map"]["official_pdf_url"].endswith("new-england-geographic-diagram-transmission-planning.pdf")
    assert payload["counts"]
    assert payload["devices"]
    assert payload["substations"]
    assert payload["search_index"]
    assert any(row["label"] == "Devices missing location/substation mapping" for row in payload["counts"])
    assert all("xPercent" in row and "yPercent" in row for row in payload["annotations"])


def test_core_lists() -> None:
    headers = auth_headers("engineer@example.com", "engineer123")
    for path in ["/api/substations", "/api/devices", "/api/icon-nodes", "/api/fiber-cables", "/api/circuits", "/api/work-orders"]:
        response = client.get(path, headers=headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)


def test_sql_analyst_cannot_run_unsafe_sql() -> None:
    response = client.post("/api/sql/select", json={"sql": "delete from users", "limit": 10}, headers=auth_headers("sqlanalyst@example.com", "sql123"))
    assert response.status_code == 403


def test_sql_select_report() -> None:
    response = client.post("/api/sql/select", json={"sql": "select circuit_id, status from circuits", "limit": 5}, headers=auth_headers("sqlanalyst@example.com", "sql123"))
    assert response.status_code == 200
    assert response.json()["row_count"] > 0


def test_field_tech_my_work_orders() -> None:
    response = client.get("/api/work-orders/my", headers=auth_headers("fieldtech@example.com", "fieldtech123"))
    assert response.status_code == 200
    assert response.json()


def test_fiber_workflow_views() -> None:
    headers = auth_headers("engineer@example.com", "engineer123")
    cable = client.get("/api/fiber-cables", headers=headers).json()[0]
    circuit = client.get("/api/circuits", headers=headers).json()[0]
    for path in [
        f"/api/fiber-cables/{cable['id']}/strand-assignments",
        f"/api/fiber-cables/{cable['id']}/splice-map",
        f"/api/circuits/{circuit['id']}/fiber-path",
    ]:
        response = client.get(path, headers=headers)
        assert response.status_code == 200
        assert response.json()


def test_fiber_assignment_conflict_requires_admin_override() -> None:
    headers = auth_headers("engineer@example.com", "engineer123")
    assignment = client.get("/api/fiber-assignments", headers=headers).json()[0]
    other_circuit = next(row for row in client.get("/api/circuits", headers=headers).json() if row["id"] != assignment["circuit_id"])
    response = client.post(
        "/api/fiber-assignments",
        json={"fiber_strand_id": assignment["fiber_strand_id"], "circuit_id": other_circuit["id"], "assignment_type": "testing", "assignment_status": "active"},
        headers=headers,
    )
    assert response.status_code == 409


def test_deviceops_refresh_and_compare() -> None:
    headers = auth_headers("engineer@example.com", "engineer123")
    refresh = client.post("/api/operational/refresh", json={}, headers=headers)
    assert refresh.status_code == 200
    assert refresh.json()["read_only"] is True
    devices = client.get("/api/operational/devices", headers=headers)
    assert devices.status_code == 200
    assert any(row["device_name"] == "WBS-ICON-01" for row in devices.json())
    compare = client.get("/api/compare/actual-vs-planned", headers=headers)
    assert compare.status_code == 200
    assert any(row["diff_type"] in {"missing_in_planned", "missing_in_actual", "value_mismatch"} for row in compare.json())
    for mode in ["planned-vs-proposed", "actual-vs-proposed", "proposed-vs-as-built", "as-built-vs-actual"]:
        response = client.get(f"/api/compare/{mode}", headers=headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)


def test_deviceops_icon_provisioning_dashboard() -> None:
    headers = auth_headers("engineer@example.com", "engineer123")
    response = client.get("/api/deviceops/icon/provisioning-dashboard", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["module_cards"]
    assert payload["device_type_cards"]
    assert len(payload["provisioning_parameter_cards"]) >= 10
    assert len(payload["circuits"]) >= 60
    assert len(payload["services"]) >= 35
    assert len(payload["service_type_cards"]) >= 10
    assert len(payload["node_service_summary"]) >= 12
    assert any(row["module_type"] == "C37_94" for row in payload["module_cards"])
    assert any("carried_devices_summary" in row and row["carried_devices_summary"] for row in payload["services"])
    assert any(row["service_type"] == "PTP" and "timing" in row["payloads_carried"].lower() for row in payload["service_type_cards"])
    assert any(row["carried_device_count"] >= 4 for row in payload["node_service_summary"])


def test_design_asset_type_validation_seed_and_permissions() -> None:
    seeded = client.get("/api/design-assets/map-records")
    assert seeded.status_code == 200
    seeded_payload = seeded.json()
    assert seeded_payload["feature_flag"] == "NEXT_PUBLIC_ENABLE_MAP_EDITING=true"
    assert any(row["slug"] == "planning-marker" for row in seeded_payload["asset_types"])
    assert any(feature["properties"]["kind"] == "design_asset_record" for feature in seeded_payload["feature_collection"]["features"])

    viewer_forbidden = client.post(
        "/api/design-assets/asset-types",
        json={"slug": "viewer-type", "display_name": "Viewer Type", "geometry_type": "point", "fields": []},
        headers=auth_headers("viewer@example.com", "viewer123"),
    )
    assert viewer_forbidden.status_code == 403

    invalid = client.post(
        "/api/design-assets/asset-types",
        json={"slug": "Bad Slug", "display_name": "Bad Slug", "geometry_type": "point", "fields": []},
        headers=auth_headers(),
    )
    assert invalid.status_code == 422

    created = client.post(
        "/api/design-assets/asset-types",
        json={
            "slug": "unit-test-marker",
            "display_name": "Unit Test Marker",
            "geometry_type": "point",
            "fields": [
                {"name": "status", "type": "enum", "required": True, "enum_options": ["planned", "proposed"]},
                {"name": "notes", "type": "textarea"},
            ],
            "searchable_fields": ["status", "notes"],
            "map_style": {"color": "#55d6ff"},
        },
        headers=auth_headers(),
    )
    assert created.status_code == 201
    assert created.json()["slug"] == "unit-test-marker"
    assert created.json()["fields"][0]["required"] is True


def test_design_asset_record_validation_geometry_crud_and_events() -> None:
    headers = auth_headers("engineer@example.com", "engineer123")
    admin_headers = auth_headers()
    type_response = client.post(
        "/api/design-assets/asset-types",
        json={
            "slug": "unit-test-span",
            "display_name": "Unit Test Span",
            "geometry_type": "line",
            "fields": [
                {"name": "fiber_count", "type": "integer", "required": True, "validation_rules": {"min": 1, "max": 288}},
                {"name": "status", "type": "enum", "required": True, "enum_options": ["planned", "proposed"]},
            ],
            "map_style": {"color": "#6ee7b7", "lineWidth": 4},
        },
        headers=admin_headers,
    )
    assert type_response.status_code == 201

    polygon_type = client.post(
        "/api/design-assets/asset-types",
        json={
            "slug": "unit-test-work-zone",
            "display_name": "Unit Test Work Zone",
            "geometry_type": "polygon",
            "fields": [{"name": "risk_level", "type": "enum", "required": True, "enum_options": ["low", "high"]}],
            "map_style": {"color": "#f5c451", "fillOpacity": 0.2},
        },
        headers=admin_headers,
    )
    assert polygon_type.status_code == 201

    object_type = client.post(
        "/api/design-assets/asset-types",
        json={
            "slug": "unit-test-custom-object",
            "display_name": "Unit Test Custom Object",
            "geometry_type": "table_only",
            "fields": [
                {"name": "object_name", "type": "string", "required": True},
                {"name": "quantity", "type": "integer"},
                {"name": "rating", "type": "number"},
                {"name": "in_service", "type": "boolean"},
                {"name": "inspection_date", "type": "date"},
                {"name": "category", "type": "enum", "enum_options": ["permit", "vendor", "inspection"]},
                {"name": "metadata", "type": "json"},
            ],
            "searchable_fields": ["object_name", "category"],
        },
        headers=headers,
    )
    assert object_type.status_code == 201
    assert object_type.json()["geometry_type"] == "table_only"

    missing_required = client.post(
        "/api/design-assets/records",
        json={
            "asset_type_slug": "unit-test-span",
            "display_label": "Missing required field",
            "geometry": {"type": "LineString", "coordinates": [[-72.0, 42.0], [-71.9, 42.1]]},
            "properties": {"status": "planned"},
        },
        headers=headers,
    )
    assert missing_required.status_code == 422

    bad_geometry = client.post(
        "/api/design-assets/records",
        json={
            "asset_type_slug": "unit-test-span",
            "display_label": "Bad geometry",
            "geometry": {"type": "Point", "coordinates": [-72.0, 42.0]},
            "properties": {"fiber_count": 48, "status": "planned"},
        },
        headers=headers,
    )
    assert bad_geometry.status_code == 422

    created = client.post(
        "/api/design-assets/records",
        json={
            "asset_type_slug": "unit-test-span",
            "record_key": "UNIT-TEST-SPAN-001",
            "display_label": "Unit Test Editable Span",
            "geometry": {"type": "LineString", "coordinates": [[-72.0, 42.0], [-71.9, 42.1]]},
            "properties": {"fiber_count": 48, "status": "planned"},
            "status": "planned",
        },
        headers=headers,
    )
    assert created.status_code == 201
    record = created.json()
    assert record["properties"]["fiber_count"] == 48
    assert record["geometry"]["type"] == "LineString"

    polygon_created = client.post(
        "/api/design-assets/records",
        json={
            "asset_type_slug": "unit-test-work-zone",
            "record_key": "UNIT-TEST-WORK-ZONE-001",
            "display_label": "Unit Test Editable Work Zone",
            "geometry": {"type": "Polygon", "coordinates": [[[-72.0, 42.0], [-71.9, 42.0], [-71.9, 42.1], [-72.0, 42.1], [-72.0, 42.0]]]},
            "properties": {"risk_level": "low"},
            "status": "proposed",
        },
        headers=headers,
    )
    assert polygon_created.status_code == 201
    assert polygon_created.json()["geometry"]["type"] == "Polygon"

    object_created = client.post(
        "/api/design-assets/records",
        json={
            "asset_type_slug": "unit-test-custom-object",
            "record_key": "UNIT-TEST-OBJECT-001",
            "display_label": "Unit Test Any Data Object",
            "properties": {
                "object_name": "Synthetic cabinet inspection record",
                "quantity": 3,
                "rating": 4.5,
                "in_service": True,
                "inspection_date": "2026-06-10",
                "category": "inspection",
                "metadata": {"crew": "demo", "tags": ["custom", "database"]},
            },
            "status": "planned",
        },
        headers=headers,
    )
    assert object_created.status_code == 201
    object_record = object_created.json()
    assert object_record["geometry"] is None
    assert object_record["geometry_type"] == "table_only"
    assert object_record["properties"]["quantity"] == 3
    assert object_record["properties"]["rating"] == 4.5
    assert object_record["properties"]["in_service"] is True
    assert object_record["properties"]["metadata"]["crew"] == "demo"

    viewer_update = client.put(
        f"/api/design-assets/records/{record['id']}",
        json={"properties": {"fiber_count": 72, "status": "planned"}},
        headers=auth_headers("viewer@example.com", "viewer123"),
    )
    assert viewer_update.status_code == 403

    updated = client.put(
        f"/api/design-assets/records/{record['id']}",
        json={"properties": {"fiber_count": 72, "status": "planned"}, "display_label": "Updated Editable Span"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["version"] == 2
    assert updated.json()["display_label"] == "Updated Editable Span"

    map_payload = client.get("/api/design-assets/map-records")
    assert map_payload.status_code == 200
    assert any(feature["properties"]["recordKey"] == "UNIT-TEST-SPAN-001" for feature in map_payload.json()["feature_collection"]["features"])
    assert any(row["record_key"] == "UNIT-TEST-OBJECT-001" for row in map_payload.json()["records"])
    assert not any(feature["properties"].get("recordKey") == "UNIT-TEST-OBJECT-001" for feature in map_payload.json()["feature_collection"]["features"])

    events = client.get(f"/api/design-assets/records/{record['id']}/events")
    assert events.status_code == 200
    assert {event["event_type"] for event in events.json()} >= {"record_created", "record_updated"}

    archived = client.delete(f"/api/design-assets/records/{record['id']}", headers=headers)
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"


def test_design_record_issues_living_database_work_order() -> None:
    headers = auth_headers("engineer@example.com", "engineer123")
    type_response = client.post(
        "/api/design-assets/asset-types",
        json={
            "slug": "unit-test-living-work-object",
            "display_name": "Unit Test Living Work Object",
            "geometry_type": "point",
            "fields": [
                {"name": "object_name", "label": "Object name", "type": "string", "required": True},
                {"name": "category", "label": "Category", "type": "string"},
            ],
            "searchable_fields": ["object_name", "category"],
            "map_style": {"color": "#55d6ff", "radius": 7},
        },
        headers=headers,
    )
    assert type_response.status_code == 201

    record_response = client.post(
        "/api/design-assets/records",
        json={
            "asset_type_slug": "unit-test-living-work-object",
            "record_key": "UNIT-TEST-LIVING-WORK-001",
            "display_label": "Unit Test Living Work Record",
            "geometry": {"type": "Point", "coordinates": [-71.72, 42.21]},
            "properties": {"object_name": "Unit Test Living Work Record", "category": "work-order-demo"},
            "status": "proposed",
            "source": "synthetic_demo",
            "visibility": "synthetic-demo",
        },
        headers=headers,
    )
    assert record_response.status_code == 201
    record = record_response.json()

    viewer_forbidden = client.post(
        f"/api/design-assets/records/{record['id']}/issue-work-order",
        json={},
        headers=auth_headers("viewer@example.com", "viewer123"),
    )
    assert viewer_forbidden.status_code == 403

    issued = client.post(
        f"/api/design-assets/records/{record['id']}/issue-work-order",
        json={"title": "Install demo living database object", "tasks": ["Review design package", "Complete field verification"]},
        headers=headers,
    )
    assert issued.status_code == 201
    payload = issued.json()
    assert payload["work_order"]["work_order_number"].startswith("WO-DESIGN-")
    assert payload["work_order"]["work_type"] == "design_database_work"
    assert len(payload["tasks"]) == 2
    assert payload["record"]["status"] == "in_review"
    assert payload["record"]["properties"]["latest_work_order_id"] == payload["work_order"]["id"]
    assert payload["record"]["properties"]["living_database_status"] == "work_order_issued"

    order_detail = client.get(f"/api/work-orders/{payload['work_order']['id']}", headers=headers)
    assert order_detail.status_code == 200
    assert "UNIT-TEST-LIVING-WORK-001" in order_detail.json()["description"]

    task_rows = client.get("/api/work-order-tasks?search=Review%20design%20package&limit=500", headers=headers)
    assert task_rows.status_code == 200
    assert any(row["work_order_id"] == payload["work_order"]["id"] and row["task_title"] == "Review design package" for row in task_rows.json())

    events = client.get(f"/api/design-assets/records/{record['id']}/events", headers=headers)
    assert any(event["event_type"] == "record_work_order_issued" for event in events.json())


def test_design_blueprint_export_import_and_core_module_bundle() -> None:
    headers = auth_headers("engineer@example.com", "engineer123")
    blueprints = client.get("/api/design-assets/module-blueprints", headers=headers)
    assert blueprints.status_code == 200
    catalog = blueprints.json()
    core = next(row for row in catalog if row["key"] == "core-telecom-rebuild")
    assert core["asset_type_count"] >= 15
    assert {"design-circuit", "design-device", "design-device-port", "design-distribution-pole", "design-opgw-cable", "design-fiber-strand", "design-fiber-splice", "design-patch-panel-port", "design-fiber-assignment", "design-database-object", "design-module-snapshot-record"} <= {row["slug"] for row in core["asset_types"]}

    installed = client.post("/api/design-assets/module-blueprints/core-telecom-rebuild/install", json={}, headers=headers)
    assert installed.status_code == 201
    install_payload = installed.json()
    assert install_payload["created_asset_types"] >= 15
    assert "design-circuit" in install_payload["installed_asset_type_slugs"]

    circuit = client.post(
        "/api/design-assets/records",
        json={
            "asset_type_slug": "design-circuit",
            "record_key": "DESIGN-CIRCUIT-REBUILD-001",
            "display_label": "Design Mode Rebuild Circuit",
            "geometry": {"type": "LineString", "coordinates": [[-71.9, 42.0], [-71.8, 42.1]]},
            "properties": {
                "circuit_id": "DESIGN-CIRCUIT-REBUILD-001",
                "circuit_name": "Design Mode Rebuild Circuit",
                "service_type": "Ethernet",
                "criticality": "normal",
                "a_end": "DEMO-A",
                "z_end": "DEMO-Z",
                "fiber_assignment_ids": ["DESIGN-ASSIGN-001"],
                "service_parameters": {"bandwidth": "1G", "synthetic": True},
                "status": "planned",
            },
            "status": "planned",
        },
        headers=headers,
    )
    assert circuit.status_code == 201
    assert circuit.json()["asset_type_slug"] == "design-circuit"

    exported = client.get("/api/design-assets/blueprint?include_records=true&asset_type_slug=design-circuit", headers=headers)
    assert exported.status_code == 200
    blueprint = exported.json()
    assert blueprint["blueprint_version"] == "gridassetlink-design-blueprint-v1"
    assert [row["slug"] for row in blueprint["asset_types"]] == ["design-circuit"]
    assert any(row["record_key"] == "DESIGN-CIRCUIT-REBUILD-001" for row in blueprint["records"])

    reimported = client.post("/api/design-assets/blueprint/import", json={**blueprint, "mode": "skip_existing"}, headers=headers)
    assert reimported.status_code == 201
    assert reimported.json()["skipped_asset_types"] == 1
    assert reimported.json()["skipped_records"] >= 1

    materialized = client.post(f"/api/design-assets/records/{circuit.json()['id']}/materialize", json={"mode": "upsert"}, headers=headers)
    assert materialized.status_code == 200
    materialized_payload = materialized.json()
    assert materialized_payload["action"] == "created"
    assert materialized_payload["entity"] == "circuits"
    assert materialized_payload["payload"]["circuit_id"] == "DESIGN-CIRCUIT-REBUILD-001"

    backend_circuits = client.get("/api/circuits?search=DESIGN-CIRCUIT-REBUILD-001", headers=headers)
    assert backend_circuits.status_code == 200
    backend_row = next(row for row in backend_circuits.json() if row["circuit_id"] == "DESIGN-CIRCUIT-REBUILD-001")
    assert backend_row["circuit_name"] == "Design Mode Rebuild Circuit"
    assert backend_row["ownership_type"] == "synthetic_demo"
    assert backend_row["status"] == "planned"

    materialized_again = client.post(f"/api/design-assets/records/{circuit.json()['id']}/materialize", json={"mode": "upsert"}, headers=headers)
    assert materialized_again.status_code == 200
    assert materialized_again.json()["action"] == "updated"

    pole = client.post(
        "/api/design-assets/records",
        json={
            "asset_type_slug": "design-distribution-pole",
            "record_key": "DESIGN-POLE-REBUILD-001",
            "display_label": "Design Mode Pole 001",
            "geometry": {"type": "Point", "coordinates": [-71.81, 42.08]},
            "properties": {
                "pole_id": "DESIGN-POLE-REBUILD-001",
                "route_id": "DESIGN-ROUTE-001",
                "structure_type": "tangent",
                "has_splice": False,
                "slack_loop_feet": 25,
                "fiber_assignment_ids": ["DESIGN-ASSIGN-001"],
                "status": "planned",
            },
            "status": "planned",
        },
        headers=headers,
    )
    assert pole.status_code == 201
    pole_materialized = client.post(f"/api/design-assets/records/{pole.json()['id']}/materialize", json={"mode": "upsert"}, headers=headers)
    assert pole_materialized.status_code == 200
    assert pole_materialized.json()["entity"] == "regional-structures"
    backend_poles = client.get("/api/regional-structures?search=DESIGN-POLE-REBUILD-001", headers=headers)
    assert any(row["structure_number"] == "DESIGN-POLE-REBUILD-001" for row in backend_poles.json())

    opgw = client.post(
        "/api/design-assets/records",
        json={
            "asset_type_slug": "design-opgw-cable",
            "record_key": "DESIGN-OPGW-REBUILD-001",
            "display_label": "Design Mode OPGW Section 001",
            "geometry": {"type": "LineString", "coordinates": [[-71.81, 42.08], [-71.79, 42.1]]},
            "properties": {
                "cable_id": "DESIGN-OPGW-REBUILD-001",
                "parent_route_id": "DESIGN-ROUTE-001",
                "from_splice_point_id": "DESIGN-SPLICE-A",
                "to_splice_point_id": "DESIGN-SPLICE-B",
                "fiber_count": 48,
                "available_strands": 40,
                "assigned_strands": 8,
                "status": "planned",
            },
            "status": "planned",
        },
        headers=headers,
    )
    assert opgw.status_code == 201
    opgw_materialized = client.post(f"/api/design-assets/records/{opgw.json()['id']}/materialize", json={"mode": "upsert"}, headers=headers)
    assert opgw_materialized.status_code == 200
    assert opgw_materialized.json()["entity"] == "fiber-cables"
    backend_fiber = client.get("/api/fiber-cables?search=DESIGN-OPGW-REBUILD-001", headers=headers)
    fiber_row = next(row for row in backend_fiber.json() if row["cable_id"] == "DESIGN-OPGW-REBUILD-001")
    assert fiber_row["cable_type"] == "OPGW"
    assert fiber_row["fiber_count"] == 48

    splice = client.post(
        "/api/design-assets/records",
        json={
            "asset_type_slug": "design-splice-point",
            "record_key": "DESIGN-SPLICE-REBUILD-001",
            "display_label": "Design Mode Splice Point 001",
            "geometry": {"type": "Point", "coordinates": [-71.8, 42.09]},
            "properties": {
                "splice_point_id": "DESIGN-SPLICE-REBUILD-001",
                "closure_type": "aerial_opgw_splice",
                "connected_cable_ids": ["DESIGN-OPGW-REBUILD-001"],
                "splice_count": 48,
                "matrix_json": {"rows": []},
                "status": "planned",
            },
            "status": "planned",
        },
        headers=headers,
    )
    assert splice.status_code == 201
    splice_materialized = client.post(f"/api/design-assets/records/{splice.json()['id']}/materialize", json={"mode": "upsert"}, headers=headers)
    assert splice_materialized.status_code == 200
    assert splice_materialized.json()["entity"] == "splice-closures"
    backend_splices = client.get("/api/splice-closures?search=DESIGN-SPLICE-REBUILD-001", headers=headers)
    assert any(row["closure_id"] == "DESIGN-SPLICE-REBUILD-001" for row in backend_splices.json())


def test_design_agent_tools_create_and_materialize_objects() -> None:
    headers = auth_headers("engineer@example.com", "engineer123")
    tools_response = client.get("/api/design-assets/agent-tools", headers=headers)
    assert tools_response.status_code == 200
    tools = tools_response.json()
    tool_keys = {tool["tool_key"] for tool in tools}
    assert {"create-circuit", "create-device", "create-device-port", "create-pole", "create-fiber-span", "create-fiber-strand", "create-splice", "create-fiber-splice", "create-patch-panel", "create-patch-panel-port", "create-fiber-assignment", "create-database-object"} <= tool_keys
    assert all(tool["endpoint"].startswith("/api/design-assets/agent-tools/") for tool in tools)
    database_tool = next(tool for tool in tools if tool["tool_key"] == "create-database-object")
    assert database_tool["supports_materialize"] is False
    assert database_tool["backend_entity"] is None

    circuit = client.post(
        "/api/design-assets/agent-tools/create-circuit/run",
        json={
            "materialize": True,
            "geometry": {"type": "LineString", "coordinates": [[-72.05, 42.15], [-72.0, 42.2]]},
            "properties": {
                "circuit_id": "AGENT-DESIGN-CIRCUIT-001",
                "circuit_name": "Agent Design Circuit 001",
                "service_type": "Ethernet",
                "criticality": "high",
                "status": "planned",
            },
        },
        headers=headers,
    )
    assert circuit.status_code == 201
    circuit_payload = circuit.json()
    assert circuit_payload["record"]["asset_type_slug"] == "design-circuit"
    assert circuit_payload["materialization"]["entity"] == "circuits"
    assert circuit_payload["materialization"]["action"] == "created"
    assert any(row["circuit_id"] == "AGENT-DESIGN-CIRCUIT-001" for row in client.get("/api/circuits?search=AGENT-DESIGN-CIRCUIT-001", headers=headers).json())

    pole = client.post(
        "/api/design-assets/agent-tools/create-pole/run",
        json={
            "materialize": True,
            "geometry": {"type": "Point", "coordinates": [-72.01, 42.16]},
            "properties": {"pole_id": "AGENT-DESIGN-POLE-001", "route_id": "AGENT-ROUTE-001", "structure_type": "angle", "status": "planned"},
        },
        headers=headers,
    )
    assert pole.status_code == 201
    assert pole.json()["materialization"]["entity"] == "regional-structures"

    span = client.post(
        "/api/design-assets/agent-tools/create-fiber-span/run",
        json={
            "materialize": True,
            "geometry": {"type": "LineString", "coordinates": [[-72.01, 42.16], [-71.99, 42.18]]},
            "properties": {"cable_id": "AGENT-DESIGN-FIBER-001", "fiber_count": 72, "from_splice_point_id": "AGENT-SPL-A", "to_splice_point_id": "AGENT-SPL-B", "status": "planned"},
        },
        headers=headers,
    )
    assert span.status_code == 201
    assert span.json()["materialization"]["entity"] == "fiber-cables"

    splice = client.post(
        "/api/design-assets/agent-tools/create-splice/run",
        json={
            "materialize": True,
            "geometry": {"type": "Point", "coordinates": [-72.0, 42.17]},
            "properties": {"splice_point_id": "AGENT-DESIGN-SPLICE-001", "closure_type": "aerial_opgw_splice", "connected_cable_ids": ["AGENT-DESIGN-FIBER-001"], "status": "planned"},
        },
        headers=headers,
    )
    assert splice.status_code == 201
    assert splice.json()["materialization"]["entity"] == "splice-closures"

    assignment = client.post(
        "/api/design-assets/agent-tools/create-fiber-assignment/run",
        json={
            "materialize": True,
            "properties": {"assignment_id": "AGENT-DESIGN-ASSIGN-001", "assignment_name": "Agent Design Assignment 001", "service_type": "Ethernet", "status": "planned"},
        },
        headers=headers,
    )
    assert assignment.status_code == 201
    assert assignment.json()["record"]["geometry"] is None
    assert assignment.json()["materialization"]["entity"] == "fiber-assignments"

    device = client.post(
        "/api/design-assets/agent-tools/create-device/run",
        json={
            "materialize": True,
            "properties": {"device_name": "AGENT-DESIGN-DEVICE-001", "device_type": "switch", "manufacturer": "Synthetic", "model": "DemoSwitch", "status": "planned"},
        },
        headers=headers,
    )
    assert device.status_code == 201
    assert device.json()["materialization"]["entity"] == "devices"
    assert any(row["device_name"] == "AGENT-DESIGN-DEVICE-001" for row in client.get("/api/devices?search=AGENT-DESIGN-DEVICE-001", headers=headers).json())

    device_port = client.post(
        "/api/design-assets/agent-tools/create-device-port/run",
        json={
            "materialize": True,
            "properties": {"port_name": "AGENT-DESIGN-DEVICE-001-ETH-1", "port_type": "Ethernet", "physical_label": "AGENT-DESIGN-DEVICE-001-ETH-1", "status": "available"},
        },
        headers=headers,
    )
    assert device_port.status_code == 201
    assert device_port.json()["materialization"]["entity"] == "device-ports"

    strand = client.post(
        "/api/design-assets/agent-tools/create-fiber-strand/run",
        json={
            "materialize": True,
            "properties": {"strand_key": "AGENT-DESIGN-FIBER-001-F001", "strand_number": 1, "strand_color": "blue", "status": "available"},
        },
        headers=headers,
    )
    assert strand.status_code == 201
    assert strand.json()["materialization"]["entity"] == "fiber-strands"

    fiber_splice = client.post(
        "/api/design-assets/agent-tools/create-fiber-splice/run",
        json={
            "materialize": True,
            "properties": {"splice_key": "AGENT-DESIGN-SPLICE-ROW-001", "splice_type": "straight_through", "incoming_strand_number": 1, "outgoing_strand_number": 1, "loss_db": 0.05, "status": "planned"},
        },
        headers=headers,
    )
    assert fiber_splice.status_code == 201
    assert fiber_splice.json()["materialization"]["entity"] == "fiber-splices"

    database_object = client.post(
        "/api/design-assets/agent-tools/create-database-object/run",
        json={
            "materialize": True,
            "properties": {
                "object_id": "AGENT-DESIGN-OBJECT-001",
                "object_name": "Agent Design Object 001",
                "category": "custom_inventory",
                "status": "planned",
                "metadata": {"synthetic": True, "module": "demo"},
            },
        },
        headers=headers,
    )
    assert database_object.status_code == 201
    database_payload = database_object.json()
    assert database_payload["record"]["asset_type_slug"] == "design-database-object"
    assert database_payload["record"]["geometry"] is None
    assert database_payload["materialization"] is None
    assert database_payload["record"]["properties"]["metadata"]["synthetic"] is True


def test_design_terminal_command_creates_answers_renames_and_prompts() -> None:
    headers = auth_headers("engineer@example.com", "engineer123")
    command = client.post(
        "/api/design-assets/terminal-command",
        json={
            "command": "Build new pole between Meadow-Road-Str-0060 and Meadow-Road-Str-0049 and add a splice to the pole",
            "materialize": True,
            "context": {
                "reference_assets": [
                    {"id": "meadow-0060", "label": "Meadow-Road-Str-0060", "kind": "transmission_structure", "coordinates": [-72.01, 42.16]},
                    {"id": "meadow-0049", "label": "Meadow-Road-Str-0049", "kind": "transmission_structure", "coordinates": [-71.99, 42.18]},
                ]
            },
        },
        headers=headers,
    )
    assert command.status_code == 200
    payload = command.json()
    action_names = {row["action"] for row in payload["actions"]}
    assert {"create_pole", "create_splice_can"} <= action_names
    assert payload["needs_input"] is False
    created_pole_key = next(row["record_key"] for row in payload["actions"] if row["action"] == "create_pole")

    seeded_fiber = client.post(
        "/api/design-assets/agent-tools/create-fiber-span/run",
        json={
            "materialize": True,
            "geometry": {"type": "LineString", "coordinates": [[-72.03, 42.14], [-72.0, 42.17]]},
            "properties": {"cable_id": "TERMINAL-DESIGN-FIBER-001", "fiber_count": 96, "from_splice_point_id": "TERM-SPL-A", "to_splice_point_id": "TERM-SPL-B", "status": "planned"},
        },
        headers=headers,
    )
    assert seeded_fiber.status_code == 201

    fiber_question = client.post(
        "/api/design-assets/terminal-command",
        json={"command": "How many strands of fiber are on TERMINAL-DESIGN-FIBER-001 and where does it go to?"},
        headers=headers,
    )
    assert fiber_question.status_code == 200
    question_payload = fiber_question.json()
    assert question_payload["answers"]
    assert any("96" in row["summary"] or row.get("fields", {}).get("fiber_count") == 96 for row in question_payload["answers"])

    rename = client.post(
        "/api/design-assets/terminal-command",
        json={"command": f"rename pole {created_pole_key} to MEADOW-ROAD-CMD-POLE-0055"},
        headers=headers,
    )
    assert rename.status_code == 200
    assert rename.json()["actions"][0]["status"] == "updated"
    assert rename.json()["actions"][0]["record_key"] == "MEADOW-ROAD-CMD-POLE-0055"

    incomplete = client.post(
        "/api/design-assets/terminal-command",
        json={"command": "add splice can to my pole and attach a span"},
        headers=headers,
    )
    assert incomplete.status_code == 200
    assert incomplete.json()["needs_input"] is True
    prompt_fields = {row["field"] for row in incomplete.json()["parameter_prompts"]}
    assert {"splice_target", "span_endpoints"} <= prompt_fields


def test_design_module_snapshot_capture_and_replay() -> None:
    headers = auth_headers("engineer@example.com", "engineer123")
    installed = client.post("/api/design-assets/module-blueprints/core-telecom-rebuild/install", json={}, headers=headers)
    assert installed.status_code == 201

    entities = client.get("/api/design-assets/module-entities", headers=headers)
    assert entities.status_code == 200
    entity_names = {row["entity"] for row in entities.json()}
    assert {"circuits", "fiber-cables", "fiber-strands", "splice-closures", "devices"} <= entity_names
    assert "users" not in entity_names
    assert "audit-logs" not in entity_names

    captured = client.post(
        "/api/design-assets/module-snapshot",
        json={"entities": ["circuits", "fiber-cables"], "limit_per_entity": 3, "mode": "upsert"},
        headers=headers,
    )
    assert captured.status_code == 201
    captured_payload = captured.json()
    assert captured_payload["entities"] == ["circuits", "fiber-cables"]
    assert captured_payload["result_count"] >= 1
    assert captured_payload["created_records"] + captured_payload["updated_records"] >= 1

    package_snapshot = client.post(
        "/api/design-assets/records",
        json={
            "asset_type_slug": "design-module-snapshot-record",
            "record_key": "module-snapshot:providers:SNAPSHOT-PACKAGE-PROVIDER-001",
            "display_label": "providers: Snapshot Package Provider 001",
            "properties": {
                "source_entity": "providers",
                "source_record_id": "",
                "source_label": "Snapshot Package Provider 001",
                "snapshot_status": "captured",
                "dependency_notes": "API test package replay row with full backend attributes.",
                "record_json": {
                    "provider_name": "SNAPSHOT-PACKAGE-PROVIDER-001",
                    "provider_type": "synthetic_demo",
                    "account_number": "PKG-DEMO-ONLY",
                    "noc_phone": "555-0001",
                    "support_email": "package-demo@example.invalid",
                    "escalation_contact": "Synthetic Package Demo",
                    "notes": "Created from Design Mode rebuild package import and replay.",
                },
            },
            "status": "planned",
        },
        headers=headers,
    )
    assert package_snapshot.status_code == 201
    exported_package = client.get("/api/design-assets/rebuild-package?include_records=true", headers=headers)
    assert exported_package.status_code == 200
    package_payload = exported_package.json()
    assert package_payload["package_version"] == "gridassetlink-design-rebuild-package-v1"
    assert package_payload["blueprint"]["blueprint_version"] == "gridassetlink-design-blueprint-v1"
    assert package_payload["snapshot_summary"]["snapshot_record_count"] >= 1
    assert any(tool["tool_key"] == "create-fiber-span" for tool in package_payload["agent_tools"])

    imported_package = client.post(
        "/api/design-assets/rebuild-package/import",
        json={**package_payload, "mode": "upsert", "replay_snapshots": True, "replay_options": {"entities": ["providers"], "limit": 50}},
        headers=headers,
    )
    assert imported_package.status_code == 201
    imported_package_payload = imported_package.json()
    assert imported_package_payload["replay_requested"] is True
    assert imported_package_payload["replay_result"]["materialized_count"] >= 1
    package_providers = client.get("/api/providers?search=SNAPSHOT-PACKAGE-PROVIDER-001", headers=headers)
    assert any(row["provider_name"] == "SNAPSHOT-PACKAGE-PROVIDER-001" and row["account_number"] == "PKG-DEMO-ONLY" for row in package_providers.json())

    snapshot_record = client.post(
        "/api/design-assets/records",
        json={
            "asset_type_slug": "design-module-snapshot-record",
            "record_key": "module-snapshot:providers:SNAPSHOT-PROVIDER-001",
            "display_label": "providers: Snapshot Provider 001",
            "properties": {
                "source_entity": "providers",
                "source_record_id": "",
                "source_label": "Snapshot Provider 001",
                "snapshot_status": "captured",
                "dependency_notes": "API test replay row with full backend attributes.",
                "record_json": {
                    "provider_name": "SNAPSHOT-PROVIDER-001",
                    "provider_type": "synthetic_demo",
                    "account_number": "DEMO-ONLY",
                    "noc_phone": "555-0000",
                    "support_email": "demo@example.invalid",
                    "escalation_contact": "Synthetic Demo",
                    "notes": "Created from Design Mode module snapshot replay.",
                },
            },
            "status": "planned",
        },
        headers=headers,
    )
    assert snapshot_record.status_code == 201
    replayed = client.post(
        "/api/design-assets/module-snapshot/materialize",
        json={"record_ids": [snapshot_record.json()["id"]], "mode": "upsert", "preserve_ids": True, "normalize_user_refs": True},
        headers=headers,
    )
    assert replayed.status_code == 200
    replayed_payload = replayed.json()
    assert replayed_payload["materialized_count"] == 1
    assert replayed_payload["results"][0]["entity"] == "providers"
    providers = client.get("/api/providers?search=SNAPSHOT-PROVIDER-001", headers=headers)
    assert providers.status_code == 200
    assert any(row["provider_name"] == "SNAPSHOT-PROVIDER-001" and row["account_number"] == "DEMO-ONLY" for row in providers.json())


def test_deviceops_proposed_change_to_work_order_and_checklist() -> None:
    headers = auth_headers("engineer@example.com", "engineer123")
    nodes = client.get("/api/icon-nodes", headers=headers).json()
    templates = client.get("/api/icon/service-templates", headers=headers).json()
    template = next(row for row in templates if row["service_type"] == "Ethernet")
    payload = {
        "title": "Add Ethernet service for TEST-DOP-001",
        "description": "API test proposed change",
        "change_type": "add_icon_service",
        "target_entity_type": "icon_node",
        "target_entity_id": nodes[0]["id"],
        "risk_level": "normal",
        "proposed_state_json": {
            "service_template_id": template["id"],
            "service_type": "Ethernet",
            "service_name": "TEST-DOP-001",
            "a_end_node_id": nodes[0]["id"],
            "z_end_node_id": nodes[1]["id"],
            "circuit_id": "TEST-DOP-001",
            "port_speed": "1G",
            "mtu": "1500",
            "manual_reference": "SEL manual section placeholder",
            "engineering_standard_reference": "TelecomNE standard placeholder",
        },
    }
    created = client.post("/api/proposed-changes", json=payload, headers=headers)
    assert created.status_code == 201
    change_id = created.json()["id"]
    submitted = client.post(f"/api/proposed-changes/{change_id}/submit", json={}, headers=headers)
    assert submitted.status_code == 200
    assert submitted.json()["approval_status"] == "pending_approval"
    approved = client.post(f"/api/proposed-changes/{change_id}/approve", json={}, headers=headers)
    assert approved.status_code == 200
    converted = client.post(f"/api/proposed-changes/{change_id}/convert-to-work-order", json={}, headers=headers)
    assert converted.status_code == 200
    assert converted.json()["work_order"]["work_type"] == "proposed_change_install"
    checklist_id = converted.json()["commissioning_checklist"]["id"]
    completed = client.post(
        f"/api/commissioning/checklists/{checklist_id}/complete-item",
        json={"item_number": 1, "status": "pass", "actual_result": "test pass"},
        headers=headers,
    )
    assert completed.status_code == 200
    assert completed.json()["items"][0]["status"] == "pass"
    attached = client.post(
        f"/api/commissioning/checklists/{checklist_id}/attach-evidence",
        json={"item_id": completed.json()["items"][0]["id"], "filename": "latency-test.txt", "file_url": "/uploads/latency-test.txt"},
        headers=headers,
    )
    assert attached.status_code == 200
    assert attached.json()["attachment_type"] == "test_evidence"


def test_regional_grid_import_link_assume_and_convert_opgw() -> None:
    headers = auth_headers("engineer@example.com", "engineer123")
    imported = client.post("/api/regional-grid/import/mock-opengridworks", json={}, headers=headers)
    assert imported.status_code == 200
    assert imported.json()["public_reference_only"] is True

    substations = client.get("/api/regional-grid/substations", params={"state": "Massachusetts"}, headers=headers)
    assert substations.status_code == 200
    assert substations.json()
    assert all(row["reference_type"] == "public_reference" for row in substations.json())

    internal_substation = next(row for row in client.get("/api/substations", headers=headers).json() if row["substation_code"] == "WBS")
    unlinked = next(row for row in substations.json() if not row["linked"])
    linked = client.put(f"/api/regional-grid/substations/{unlinked['id']}/link", json={"internal_substation_id": internal_substation["id"]}, headers=headers)
    assert linked.status_code == 200
    assert linked.json()["linked"] is True

    lines = client.get("/api/regional-grid/transmission-lines", params={"voltage_class_filter": "115 kV"}, headers=headers)
    assert lines.status_code == 200
    assert lines.json()
    line_id = lines.json()[0]["id"]
    assumed = client.post(
        f"/api/regional-grid/transmission-lines/{line_id}/assume-opgw",
        json={"confidence_level": "medium", "assumption_basis": "API test public-reference planning assumption"},
        headers=headers,
    )
    assert assumed.status_code == 200
    assert assumed.json()["status"] == "planning_assumption"

    converted = client.post(f"/api/regional-grid/opgw-assumptions/{assumed.json()['id']}/convert-to-fiber", json={"engineer_approved": True}, headers=headers)
    assert converted.status_code == 200
    assert converted.json()["fiber_cable"]["status"] == "planned_assumed"
    assert converted.json()["strand_count"] >= 24


def test_regional_grid_synthetic_network_access_and_reports() -> None:
    engineer_headers = auth_headers("engineer@example.com", "engineer123")
    summary = client.get("/api/regional-grid/summary", headers=engineer_headers)
    assert summary.status_code == 200
    card_map = {row["label"]: row["value"] for row in summary.json()["cards"]}
    assert int(card_map["Proposed SEL ICON circuits"]) >= 64

    network = client.get("/api/regional-grid/sel-icon-synthetic-network", headers=engineer_headers)
    assert network.status_code == 200
    assert len(network.json()["rings"]) == 7
    assert len(network.json()["circuits"]) >= 64
    assert any(row["circuit_id"] == "87L-MA-WBS-AUB-001" for row in network.json()["circuits"])

    contractor_login = client.post("/api/auth/login", json={"email": "contractor@example.com", "password": "contractor123"})
    assert contractor_login.status_code == 200
    contractor_id = contractor_login.json()["user"]["id"]
    contractor_headers = {"Authorization": f"Bearer {contractor_login.json()['access_token']}"}
    visible_orders = client.get("/api/regional-grid/work-orders/visible", headers=contractor_headers)
    assert visible_orders.status_code == 200
    assert visible_orders.json()
    assert all(row["assigned_field_tech_id"] == contractor_id for row in visible_orders.json())

    proposed_changes = client.get("/api/proposed-changes", headers=engineer_headers)
    regional_change = next(row for row in proposed_changes.json() if row["change_number"] == "REG-PCR-2026-0001")
    host_approval = client.get(f"/api/regional-grid/access/proposed-changes/{regional_change['id']}/host-approval", headers=engineer_headers)
    assert host_approval.status_code == 200
    assert host_approval.json()["host_approval_required"] is True

    reports = client.get("/api/reports/saved", headers=engineer_headers)
    assert reports.status_code == 200
    regional_reports = [row for row in reports.json() if row["report_name"].startswith("RegionalGrid - ")]
    assert len(regional_reports) >= 20


def test_gis_scale_capabilities_empty_tile_and_search() -> None:
    capabilities = client.get("/api/gis/capabilities")
    assert capabilities.status_code == 200
    payload = capabilities.json()
    assert payload["vector_tile_endpoint"] == "/api/tiles/{layer}/{z}/{x}/{y}.mvt"
    assert "poles" in payload["layers"]
    assert "slack_loops" in payload["layers"]
    assert payload["synthetic_boundary"]
    assert payload["website_import"]["service_territory_upload_endpoint"] == "/api/service-territories/import-geojson-file"
    assert payload["website_import"]["road_centerline_upload_endpoint"] == "/api/road-centerlines/import-geojson-file"
    assert "local_computer_api_bridge" in payload["website_import"]["import_targets"]
    assert any("gridassetlink.dev/dashboard?drawer=scale" in row for row in payload["website_import"]["browser_steps"])
    assert any("Geometry-aware" in row for row in payload["cache_strategy"])

    health = client.get("/api/gis/scale-health")
    assert health.status_code == 200
    health_payload = health.json()
    assert health_payload["postgis_configured"] is False
    assert health_payload["status"] == "postgis_not_configured"
    assert health_payload["architecture_checks"]["vector_tiles"] is True
    assert health_payload["architecture_checks"]["raw_browser_pole_load"] is False
    assert "poles" in health_payload["layers"]
    assert health_payload["warnings"]

    tile = client.get("/api/tiles/poles/8/74/96.mvt")
    assert tile.status_code == 200
    assert tile.headers["content-type"].startswith("application/vnd.mapbox-vector-tile")
    assert tile.headers["x-gis-postgis"] == "false"
    assert tile.headers["etag"]
    assert tile.headers["x-gis-feature-count"] == "0"
    assert tile.headers["x-gis-tile-truncated"] == "false"
    assert tile.content == b""

    cached_tile = client.get("/api/tiles/poles/8/74/96.mvt", headers={"If-None-Match": tile.headers["etag"]})
    assert cached_tile.status_code == 304
    assert cached_tile.headers["x-gis-postgis"] == "false"

    search = client.get("/api/search", params={"type": "pole", "q": "TEST", "limit": 10})
    assert search.status_code == 200
    assert search.json()["postgis_configured"] is False
    assert search.json()["results"] == []

    generic_asset = client.get("/api/assets/fiber_route/FIBER-TEST")
    assert generic_asset.status_code == 200
    assert generic_asset.json()["postgis_configured"] is False

    roads = client.get("/api/road-centerlines/summary")
    assert roads.status_code == 200
    assert roads.json()["postgis_configured"] is False

    preflight = client.get("/api/service-territories/1/generation-preflight", params={"target_pole_count": 10_000_000})
    assert preflight.status_code == 200
    assert preflight.json()["postgis_configured"] is False
    assert preflight.json()["preflight"] is None
    assert preflight.json()["warnings"]

    preflight_post = client.post(
        "/api/service-territories/1/generation-preflight",
        json={"target_pole_count": 10_000_000, "batch_size": 50_000, "density_profile": "auto"},
    )
    assert preflight_post.status_code == 200
    assert preflight_post.json()["postgis_configured"] is False

    dirty = client.post("/api/tiles/dirty", json={"layer": "poles", "z": 16, "x": 19231, "y": 24611, "reason": "unit test"})
    assert dirty.status_code == 200
    assert dirty.json()["postgis_configured"] is False

    warm = client.post(
        "/api/service-territories/1/warm-tile-cache",
        json={"layers": ["territory", "poles", "pole_clusters"], "min_z": 8, "max_z": 15, "max_tiles": 25},
    )
    assert warm.status_code == 200
    assert warm.json()["postgis_configured"] is False

    default_warm = client.post("/api/service-territories/1/warm-tile-cache", json={})
    assert default_warm.status_code == 200
    assert default_warm.json()["postgis_configured"] is False

    dirty_geometry = client.post(
        "/api/tiles/dirty-by-geometry",
        json={
            "layers": ["poles", "spans"],
            "min_z": 14,
            "max_z": 16,
            "geojson": {"type": "Point", "coordinates": [-71.8, 42.3]},
            "reason": "unit test geometry edit",
        },
    )
    assert dirty_geometry.status_code == 200
    assert dirty_geometry.json()["postgis_configured"] is False

    invalid_dirty_geometry = client.post(
        "/api/tiles/dirty-by-geometry",
        json={
            "layers": ["not-a-layer"],
            "geojson": {"type": "Point", "coordinates": [-71.8, 42.3]},
        },
    )
    assert invalid_dirty_geometry.status_code == 404

    invalid_zoom_range = client.post(
        "/api/tiles/dirty-by-geometry",
        json={
            "layers": ["poles"],
            "min_z": 17,
            "max_z": 16,
            "geojson": {"type": "Point", "coordinates": [-71.8, 42.3]},
        },
    )
    assert invalid_zoom_range.status_code == 400

    proposed_edit = client.post(
        "/api/proposed-edits/pole",
        json={
            "service_territory_id": 1,
            "base_asset_id": "POLE-TEST",
            "geojson": {"type": "Point", "coordinates": [-71.8, 42.3]},
            "properties": {"edit_reason": "unit test"},
        },
    )
    assert proposed_edit.status_code == 201
    assert proposed_edit.json()["postgis_configured"] is False


def test_gis_scale_browser_file_upload_imports_are_postgis_gated() -> None:
    territory_geojson = b'{"type":"Polygon","coordinates":[[[-72,42],[-71.9,42],[-71.9,42.1],[-72,42.1],[-72,42]]]}'
    territory_upload = client.post(
        "/api/service-territories/import-geojson-file",
        data={"name": "Unit test uploaded territory", "source_type": "uploaded_geojson", "source_reference": "unit-test.geojson"},
        files={"file": ("unit-test.geojson", territory_geojson, "application/geo+json")},
    )
    assert territory_upload.status_code == 201
    assert territory_upload.json()["postgis_configured"] is False

    roads_geojson = b'{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Demo Road","highway":"residential"},"geometry":{"type":"LineString","coordinates":[[-72,42],[-71.99,42.01]]}}]}'
    road_upload = client.post(
        "/api/road-centerlines/import-geojson-file",
        data={"service_territory_id": "1", "source_name": "unit test roads", "source_reference": "roads.geojson", "max_features": "100"},
        files={"file": ("roads.geojson", roads_geojson, "application/geo+json")},
    )
    assert road_upload.status_code == 201
    assert road_upload.json()["postgis_configured"] is False

    invalid_upload = client.post(
        "/api/service-territories/import-geojson-file",
        data={"name": "Bad upload"},
        files={"file": ("bad.geojson", b"not json", "application/geo+json")},
    )
    assert invalid_upload.status_code == 400


def test_gis_tile_lod_plans_keep_raw_poles_at_street_zoom_only() -> None:
    low_zoom = choose_plan("poles", 8)
    density_zoom = choose_plan("poles", 9)
    mid_zoom = choose_plan("poles", 12)
    road_zoom = choose_plan("poles", 15)
    high_zoom = choose_plan("poles", 16)

    assert low_zoom is not None
    assert low_zoom.source_table == "pole_density_z8"
    low_sql = _tile_sql(low_zoom)
    assert "tile_z = 8" in low_sql
    assert "tile_x BETWEEN" in low_sql
    assert "tile_y BETWEEN" in low_sql
    assert "telecom_poles" not in low_sql

    assert density_zoom is not None
    assert density_zoom.source_table == "pole_density_z10"
    assert "tile_z = 10" in _tile_sql(density_zoom)

    assert mid_zoom is not None
    assert mid_zoom.source_table == "pole_clusters_z12"
    mid_sql = _tile_sql(mid_zoom)
    assert "tile_z = 12" in mid_sql
    assert "power(2, 12 - :z)" in mid_sql

    assert road_zoom is not None
    assert road_zoom.source_table == "pole_clusters_z15"
    road_sql = _tile_sql(road_zoom)
    assert "tile_z = 15" in road_sql
    assert "power(2, 15 - :z)" in road_sql

    assert high_zoom is not None
    assert high_zoom.source_table == "telecom_poles"
    assert high_zoom.max_features == 8000
    assert "tile_z" not in _tile_sql(high_zoom)
    assert "candidates AS MATERIALIZED" in _tile_sql(high_zoom)
    assert "LIMIT 8001" in _tile_sql(high_zoom)
    assert "AS truncated" in _tile_sql(high_zoom)


def test_gis_vector_tile_contract_covers_required_layers() -> None:
    required_layers = {
        "territory": 0,
        "poles": 8,
        "pole_clusters": 12,
        "spans": 11,
        "fiber_routes": 8,
        "splice_cases": 16,
        "handholes": 16,
        "slack_loops": 16,
        "mux_sites": 14,
        "circuit_routes": 10,
    }

    assert set(required_layers).issubset(set(supported_layers()))
    for layer, zoom in required_layers.items():
        plan = choose_plan(layer, zoom)
        assert plan is not None, f"{layer} should have a tile plan at z{zoom}"
        sql = _tile_sql(plan)
        assert "ST_AsMVTGeom" in sql
        assert "ST_AsMVT" in sql
        assert "ST_Intersects" in sql
        assert f"LIMIT {plan.max_features + 1}" in sql
        assert f"LIMIT {plan.max_features}" in sql
        assert "AS truncated" in sql


def test_gis_tile_warming_allows_only_aggregate_or_territory_plans() -> None:
    assert _is_safe_tile_warm_plan("territory", 8) is True
    assert _is_safe_tile_warm_plan("poles", 15) is True
    assert _is_safe_tile_warm_plan("pole_clusters", 15) is True
    assert _is_safe_tile_warm_plan("poles", 16) is False
    assert _is_safe_tile_warm_plan("spans", 15) is False


def test_gis_service_territory_import_normalizes_polygon_collections() -> None:
    polygon_a = {
        "type": "Polygon",
        "coordinates": [[[-72.0, 42.0], [-71.9, 42.0], [-71.9, 42.1], [-72.0, 42.1], [-72.0, 42.0]]],
    }
    polygon_b = {
        "type": "Polygon",
        "coordinates": [[[-71.8, 42.0], [-71.7, 42.0], [-71.7, 42.1], [-71.8, 42.1], [-71.8, 42.0]]],
    }
    collection = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {"name": "A"}, "geometry": polygon_a},
            {"type": "Feature", "properties": {"name": "B"}, "geometry": polygon_b},
            {"type": "Feature", "properties": {"ignored": True}, "geometry": {"type": "Point", "coordinates": [-71.85, 42.05]}},
        ],
    }
    extracted = _extract_geojson_geometry(collection)

    assert extracted["type"] == "GeometryCollection"
    assert len(extracted["geometries"]) == 2

    territory_import_source = inspect.getsource(import_service_territory)
    assert "ST_MakeValid(input_geom)" in territory_import_source
    assert "ST_UnaryUnion" in territory_import_source
    assert "ST_CollectionExtract" in territory_import_source
    assert "::geometry(MultiPolygon, 4326)" in territory_import_source
    assert "WHERE NOT ST_IsEmpty(geom)" in territory_import_source


def test_gis_service_territory_validate_persists_boundary_status() -> None:
    validate_source = inspect.getsource(validate_service_territory)

    assert "UPDATE service_territories" in validate_source
    assert "SET boundary_status = CASE" in validate_source
    assert "ST_IsValid(geom) AND NOT ST_IsEmpty(geom)" in validate_source
    assert "geom_3857 = ST_Transform(geom, 3857)" in validate_source
    assert "area_sq_miles = ST_Area(ST_Transform(geom, 5070)) / 2589988.110336" in validate_source
    assert "validation_action', 'manual_or_api_validate'" in validate_source
    assert "RETURNING id, territory_key, name, boundary_status" in validate_source


def test_gis_search_uses_indexed_columns_and_escaped_patterns() -> None:
    pole_target = _search_target("pole")
    assert pole_target["table"] == "telecom_poles"
    assert "properties" not in pole_target["search_columns"]
    assert {"pole_id", "road_name", "town", "county"}.issubset(set(pole_target["search_columns"]))

    fiber_target = _search_target("fiber")
    assert fiber_target["search_columns"] == ["fiber_route_id", "route_name"]

    assert _like_pattern("POLE_100%!") == "%POLE!_100!%!!%"


def test_gis_trace_uses_bounded_recursive_network_sql() -> None:
    sql = _recursive_trace_sql()
    assert "WITH RECURSIVE" in sql
    assert "candidate_edges" in sql
    assert "ST_Reverse(geom)" in sql
    assert "walk.depth < :max_depth" in sql
    assert "NOT next_edge.z_node_id = ANY(walk.node_path)" in sql

    trace = client.post("/api/trace/fiber", json={"a_node_id": "POLE-A", "z_node_id": "POLE-Z", "max_depth": 4})
    assert trace.status_code == 200
    assert trace.json()["postgis_configured"] is False


def test_gis_generation_worker_batches_by_estimated_pole_records() -> None:
    road_plan_source = inspect.getsource(generation_worker._prepare_generation_roads)
    worker_source = inspect.getsource(generation_worker)

    assert "estimated_pole_count" in road_plan_source
    assert "record_batch_id" in road_plan_source
    assert "estimated_poles_before" in road_plan_source
    assert "WHERE record_batch_id = :record_batch_id" in worker_source
    assert "LIMIT :batch_size OFFSET :offset" not in worker_source
    assert "next_record_batch_id = :next_record_batch_id" in worker_source


def test_gis_generation_worker_keeps_generated_assets_inside_service_territory() -> None:
    pole_insert_source = inspect.getsource(generation_worker._insert_pole_batch)
    span_insert_source = inspect.getsource(generation_worker._insert_span_batch)

    assert "ST_Covers(territory.geom, points.geom)" in pole_insert_source
    assert "clipped_spans AS" in span_insert_source
    assert "ST_Covers(territory.geom, spans.geom)" in span_insert_source
    assert "FROM clipped_spans" in span_insert_source
    assert "ST_Within(points.geom, territory.geom)" not in pole_insert_source


def test_gis_generation_worker_precomputes_tile_binned_pole_lod() -> None:
    pole_lod_source = inspect.getsource(generation_worker._insert_pole_lod)
    precompute_source = inspect.getsource(generation_worker._precompute_lod_tables)

    assert "ST_SnapToGrid" not in pole_lod_source
    assert "tile_x" in pole_lod_source
    assert "tile_y" in pole_lod_source
    assert "geom_3857" in pole_lod_source
    assert "pole_clusters_z15" in precompute_source


def test_gis_generation_worker_precomputes_tile_local_span_and_route_lod() -> None:
    span_lod_source = inspect.getsource(generation_worker._insert_span_lod)
    route_lod_source = inspect.getsource(generation_worker._insert_route_summary)

    assert "GROUP BY service_territory_id, fiber_route_id, tile_x, tile_y" in span_lod_source
    assert "span_tiles AS" in span_lod_source
    assert "ST_SnapToGrid" not in span_lod_source

    assert "generate_series(min_tile_x, max_tile_x)" in route_lod_source
    assert "generate_series(min_tile_y, max_tile_y)" in route_lod_source
    assert "ST_TileEnvelope(8, tile_x, tile_y)" in route_lod_source
    assert "ST_Intersection(geom, tile_geom)" in route_lod_source
    assert "ST_Centroid" not in route_lod_source


def test_gis_proposed_edit_targets_are_staged_and_tile_aware() -> None:
    pole_target = _proposed_edit_target("pole")
    span_target = _proposed_edit_target("span")
    fiber_target = _proposed_edit_target("fiber_route")

    assert pole_target["proposed_table"] == "proposed_poles"
    assert pole_target["base_table"] == "telecom_poles"
    assert {"poles", "pole_clusters", "spans"}.issubset(set(pole_target["layers"]))
    assert span_target["proposed_table"] == "proposed_spans"
    assert fiber_target["proposed_table"] == "proposed_fiber_routes"


def test_gis_performance_check_targets_required_scale_contract() -> None:
    required_layers = {
        "territory",
        "poles",
        "pole_clusters",
        "spans",
        "fiber_routes",
        "splice_cases",
        "handholes",
        "slack_loops",
        "mux_sites",
        "circuit_routes",
    }
    tile_checks = gis_scale_performance_check.representative_tile_checks()
    checked_layers = {check.layer for check in tile_checks}

    assert required_layers == set(gis_scale_performance_check.required_tile_layers())
    assert required_layers.issubset(checked_layers)
    assert any(check.layer == "poles" and check.z == 8 and check.expected_lod == "density" for check in tile_checks)
    assert any(check.layer == "poles" and check.z == 12 and check.expected_lod == "cluster" for check in tile_checks)
    assert any(check.layer == "poles" and check.z == 16 and check.expected_lod == "individual" for check in tile_checks)
    assert all(check.path.startswith("/api/tiles/") and check.path.endswith(".mvt") for check in tile_checks)

    checker_source = inspect.getsource(gis_scale_performance_check)
    assert "If-None-Match" in checker_source
    assert "X-GIS-Tile-Truncated" in checker_source
    assert "application/vnd.mapbox-vector-tile" in checker_source
    assert "/api/search?type=pole&q=TEST&limit=25&offset=0" in checker_source
    assert "/api/trace/fiber" in checker_source
    assert "raw_browser_pole_load_allowed" in checker_source


def test_gis_performance_check_url_join_preserves_api_mounts() -> None:
    join_url = gis_scale_performance_check.join_api_url

    assert join_url("http://localhost:8000", "/api/gis/capabilities") == "http://localhost:8000/api/gis/capabilities"
    assert join_url("https://gridassetlink.dev/backend", "/api/gis/capabilities") == "https://gridassetlink.dev/backend/api/gis/capabilities"
    assert join_url("https://gridassetlink.dev/backend/", "api/gis/capabilities") == "https://gridassetlink.dev/backend/api/gis/capabilities"
    assert join_url("https://api.example.com/api", "/api/gis/capabilities") == "https://api.example.com/api/gis/capabilities"
