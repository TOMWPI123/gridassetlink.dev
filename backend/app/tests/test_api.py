import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["AUTO_SEED"] = "true"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed.seed import seed_database  # noqa: E402

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
