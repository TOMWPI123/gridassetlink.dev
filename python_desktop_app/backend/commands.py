from __future__ import annotations

from typing import Any

from .database import dependencies_for, list_assets, save_asset


DEFAULT_COORDINATE = [-71.315, 42.38]


def run_local_command(command: str, selected_asset_id: str | None = None) -> dict[str, Any]:
    normalized = " ".join(command.strip().lower().split())
    if not normalized:
        return _response(command, "empty", "Type a local command such as 'create pole' or 'trace service'.")

    if "create pole" in normalized or normalized == "pole":
        asset = _create_pole()
        return _response(command, "create_pole", f"Created synthetic pole {asset['id']}.", actions=[{"type": "created", "asset": asset}])

    if "create fiber" in normalized or "create span" in normalized or "fiber span" in normalized:
        asset = _create_fiber_span()
        return _response(command, "create_fiber_span", f"Created proposed fiber span {asset['id']}.", actions=[{"type": "created", "asset": asset}])

    if "create splice" in normalized or "splice point" in normalized:
        asset = _create_splice_point()
        return _response(command, "create_splice_point", f"Created proposed splice point {asset['id']}.", actions=[{"type": "created", "asset": asset}])

    if "show circuits" in normalized and "fiber" in normalized:
        fiber_id = selected_asset_id if selected_asset_id else _first_asset_id("fiber_span")
        circuits = [
            asset
            for asset in list_assets(asset_type="circuit")
            if fiber_id and fiber_id in asset["properties"].get("route_asset_ids", [])
        ]
        return _response(command, "show_circuits_on_fiber", f"Found {len(circuits)} circuit(s) riding {fiber_id}.", answers=circuits)

    if "trace service" in normalized:
        service = _selected_or_first(selected_asset_id, "service")
        if not service:
            return _response(command, "trace_service", "No synthetic service records are available.")
        deps = dependencies_for(service["id"])
        answer = deps["direct_dependencies"] + deps["dependents"]
        return _response(command, "trace_service", f"Trace for {service['name']} returned {len(answer)} linked records.", answers=answer)

    if "list devices at substation" in normalized or ("list devices" in normalized and "substation" in normalized):
        substation_id = selected_asset_id if selected_asset_id else _first_asset_id("substation")
        devices = [
            asset
            for asset in list_assets(asset_type="device")
            if asset["properties"].get("site") == substation_id
        ]
        return _response(command, "list_devices_at_substation", f"Found {len(devices)} device(s) at {substation_id}.", answers=devices)

    if "high risk" in normalized:
        assets = [
            asset
            for asset in list_assets()
            if str(asset["properties"].get("criticality", "")).lower() in {"high", "critical"}
            or float(asset["properties"].get("risk_score") or 0) >= 80
        ]
        return _response(command, "show_high_risk_nodes", f"Found {len(assets)} high-risk synthetic records.", answers=assets)

    if "export geojson" in normalized:
        return _response(
            command,
            "export_geojson",
            "Use the Export GeoJSON button or GET /api/export/geojson to download visible assets.",
            actions=[{"type": "export_hint", "url": "/api/export/geojson"}],
        )

    return _response(
        command,
        "unknown",
        "I can run local rule-based commands: create pole, create fiber span, create splice point, show circuits on this fiber, trace service, list devices at substation, show high risk nodes, export geojson.",
    )


def _create_pole() -> dict[str, Any]:
    return save_asset(
        {
            "asset_type": "distribution_pole",
            "name": "New synthetic distribution pole",
            "status": "proposed",
            "lifecycle": "proposed",
            "geometry": {"type": "Point", "coordinates": [DEFAULT_COORDINATE[0] - 0.04, DEFAULT_COORDINATE[1] + 0.02]},
            "properties": {
                "pole_number": "NEW-POLE",
                "utility_owner": "TelecomNE Demo Utility",
                "telecom_role": "fiber_lateral",
                "fiber_count": 48,
                "criticality": "normal",
                "source": "local-command",
                "notes": "Created by local command panel.",
            },
        }
    )


def _create_fiber_span() -> dict[str, Any]:
    return save_asset(
        {
            "asset_type": "fiber_span",
            "name": "New proposed OPGW span",
            "status": "proposed",
            "lifecycle": "proposed",
            "geometry": {"type": "LineString", "coordinates": [[-71.45, 42.30], [-71.18, 42.45]]},
            "properties": {
                "cable_id": "NEW-FBR",
                "cable_type": "OPGW",
                "fiber_count": 96,
                "strand_range": "1-96",
                "construction_status": "proposed",
                "route_asset_ids": ["SUB-WBS", "SUB-AUB"],
                "source": "local-command",
                "notes": "Created by local command panel.",
            },
        }
    )


def _create_splice_point() -> dict[str, Any]:
    return save_asset(
        {
            "asset_type": "splice_point",
            "name": "New proposed splice point",
            "status": "proposed",
            "lifecycle": "proposed",
            "geometry": {"type": "Point", "coordinates": [-71.26, 42.40]},
            "properties": {
                "splice_id": "NEW-SPL",
                "splice_type": "inline_splice",
                "fiber_span_id": "NEW-FBR",
                "splice_count": 12,
                "source": "local-command",
                "notes": "Created by local command panel.",
            },
        }
    )


def _first_asset_id(asset_type: str) -> str | None:
    assets = list_assets(asset_type=asset_type)
    return assets[0]["id"] if assets else None


def _selected_or_first(selected_asset_id: str | None, asset_type: str) -> dict[str, Any] | None:
    if selected_asset_id:
        matches = [asset for asset in list_assets() if asset["id"] == selected_asset_id]
        if matches and matches[0]["asset_type"] == asset_type:
            return matches[0]
    assets = list_assets(asset_type=asset_type)
    return assets[0] if assets else None


def _response(
    input_command: str,
    intent: str,
    summary: str,
    actions: list[dict[str, Any]] | None = None,
    answers: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "input": input_command,
        "intent": intent,
        "summary": summary,
        "actions": actions or [],
        "answers": answers or [],
        "needs_input": False,
    }

