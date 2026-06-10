import inspect
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["AUTO_SEED"] = "true"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed.seed import seed_database  # noqa: E402
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
