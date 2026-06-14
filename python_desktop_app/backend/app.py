from __future__ import annotations

import json
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .assistant_adapter import RuleBasedAssistant
from .config import APP_NAME, SYNTHETIC_NOTICE, settings
from .database import (
    delete_asset,
    dependencies_for,
    get_asset,
    import_csv_text,
    import_geojson,
    init_db,
    list_assets,
    save_asset,
    seed_if_empty,
    summary,
    to_geojson,
    assets_to_csv,
)
from .gis_layers import get_gis_layer, list_gis_layers


class AssetPayload(BaseModel):
    id: str | None = None
    asset_type: str
    name: str
    status: str = "proposed"
    lifecycle: str = "proposed"
    geometry: dict[str, Any]
    properties: dict[str, Any] = Field(default_factory=dict)
    source: str = "synthetic-demo"


class CommandPayload(BaseModel):
    command: str
    selected_asset_id: str | None = None


def create_app(reset_demo_data: bool = False) -> FastAPI:
    init_db(reset=reset_demo_data)
    assistant = RuleBasedAssistant()
    app = FastAPI(title=APP_NAME, version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1", "http://localhost"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if settings.frontend_dir.exists():
        app.mount("/static", StaticFiles(directory=str(settings.frontend_dir)), name="static")

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        return {"ok": True, "app": APP_NAME, "database_path": str(settings.database_path)}

    @app.get("/api/bootstrap")
    def bootstrap() -> dict[str, Any]:
        return {
            "app_name": APP_NAME,
            "synthetic_data_notice": SYNTHETIC_NOTICE,
            "database_path": str(settings.database_path),
            "offline_map_mode": settings.offline_map_mode,
            "postgis_configured": bool(settings.postgis_url),
            "tile_mode": "offline-svg" if settings.offline_map_mode else "optional-external-tiles",
        }

    @app.get("/favicon.ico", include_in_schema=False)
    def favicon() -> Response:
        return Response(status_code=204)

    @app.get("/api/summary")
    def api_summary() -> dict[str, Any]:
        return summary()

    @app.get("/api/assets")
    def api_assets(
        asset_type: str | None = Query(default=None),
        lifecycle: str | None = Query(default=None),
        status: str | None = Query(default=None),
        q: str | None = Query(default=None),
    ) -> dict[str, Any]:
        assets = list_assets(asset_type=asset_type, lifecycle=lifecycle, status=status, q=q)
        return {"assets": assets, "count": len(assets), "synthetic_data_notice": SYNTHETIC_NOTICE}

    @app.post("/api/assets", status_code=201)
    def api_create_asset(payload: AssetPayload) -> dict[str, Any]:
        try:
            asset = save_asset(payload.model_dump(exclude_none=True), action="create")
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        return {"asset": asset, "synthetic_data_notice": SYNTHETIC_NOTICE}

    @app.get("/api/assets/{asset_id}")
    def api_get_asset(asset_id: str) -> dict[str, Any]:
        asset = get_asset(asset_id)
        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found")
        return {"asset": asset}

    @app.put("/api/assets/{asset_id}")
    def api_update_asset(asset_id: str, payload: AssetPayload) -> dict[str, Any]:
        existing = get_asset(asset_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Asset not found")
        raw = payload.model_dump(exclude_none=True)
        raw["id"] = asset_id
        try:
            asset = save_asset(raw, action="update")
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        return {"asset": asset}

    @app.delete("/api/assets/{asset_id}")
    def api_delete_asset(asset_id: str) -> dict[str, Any]:
        if not delete_asset(asset_id):
            raise HTTPException(status_code=404, detail="Asset not found")
        return {"deleted": True, "id": asset_id}

    @app.get("/api/assets/{asset_id}/dependencies")
    def api_dependencies(asset_id: str) -> dict[str, Any]:
        try:
            return dependencies_for(asset_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Asset not found") from error

    @app.get("/api/gis/layers")
    def api_gis_layers() -> dict[str, Any]:
        layers = list_gis_layers()
        return {
            "layers": layers,
            "count": len(layers),
            "total_features": sum(layer["feature_count"] for layer in layers),
            "synthetic_data_notice": SYNTHETIC_NOTICE,
        }

    @app.get("/api/gis/layers/{layer_id}")
    def api_gis_layer(layer_id: str, limit: int | None = Query(default=None, ge=0, le=20000)) -> dict[str, Any]:
        try:
            return get_gis_layer(layer_id, limit=limit)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="GIS layer not found") from error
        except FileNotFoundError as error:
            raise HTTPException(status_code=404, detail=f"GIS layer file is missing: {error}") from error

    @app.get("/api/export/geojson")
    def api_export_geojson(types: str | None = Query(default=None), lifecycle: str | None = Query(default=None)) -> dict[str, Any]:
        allowed_types = {item.strip() for item in types.split(",")} if types else None
        assets = [
            asset
            for asset in list_assets(lifecycle=lifecycle)
            if not allowed_types or asset["asset_type"] in allowed_types
        ]
        return to_geojson(assets)

    @app.get("/api/export/csv")
    def api_export_csv(asset_type: str | None = Query(default=None), lifecycle: str | None = Query(default=None)) -> PlainTextResponse:
        assets = list_assets(asset_type=asset_type, lifecycle=lifecycle)
        filename = f"gridassetlink_{asset_type or 'assets'}.csv"
        return PlainTextResponse(
            assets_to_csv(assets),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @app.post("/api/import/geojson")
    async def api_import_geojson(request: Request, default_asset_type: str = "distribution_pole") -> dict[str, Any]:
        try:
            payload = await request.json()
            assets = import_geojson(payload, default_asset_type=default_asset_type)
        except (json.JSONDecodeError, ValueError) as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        return {"imported_count": len(assets), "assets": assets, "synthetic_data_notice": SYNTHETIC_NOTICE}

    @app.post("/api/import/csv")
    async def api_import_csv(request: Request, default_asset_type: str = "distribution_pole") -> dict[str, Any]:
        text = (await request.body()).decode("utf-8-sig")
        try:
            assets = import_csv_text(text, default_asset_type=default_asset_type)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        return {"imported_count": len(assets), "assets": assets, "synthetic_data_notice": SYNTHETIC_NOTICE}

    @app.post("/api/commands")
    def api_commands(payload: CommandPayload) -> dict[str, Any]:
        return assistant.run(payload.command, payload.selected_asset_id).__dict__

    @app.post("/api/reset-demo-data")
    def api_reset_demo_data() -> dict[str, Any]:
        seed_if_empty(force=True)
        return {"reset": True, "summary": summary()}

    @app.get("/")
    def index() -> FileResponse:
        index_path = settings.frontend_dir / "index.html"
        if not index_path.exists():
            raise HTTPException(status_code=500, detail="Frontend bundle not found")
        return FileResponse(index_path)

    return app
