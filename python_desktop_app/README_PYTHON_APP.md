# GridAssetLink Python Desktop App

GridAssetLink Desktop is a standalone Windows-oriented Python MVP for the fictional TelecomNE Grid Asset Links dashboard. It does not replace the existing web app. All files live under `python_desktop_app`.

This desktop app uses synthetic/demo records only by default. It is not an official National Grid product and is not for operations, SCADA, protection, CEII, or field switching decisions.

## Architecture

- `main.py` starts a local FastAPI backend on `127.0.0.1` and opens a PySide6 Qt WebEngine window.
- `backend/` owns SQLite storage, API routes, import/export, dependencies, audit logs, and rule-based command handling.
- `frontend/` is a local HTML/CSS/JavaScript dashboard served by FastAPI and embedded in the desktop shell.
- `data/demo_assets.json` seeds fictional substations, transmission lines, structures, OPGW routes, fiber spans, splice points, distribution poles, devices, circuits, services, and work orders.
- SQLite is the default local store. Optional PostGIS settings are reserved in `.env.example` but not required.
- The map uses an offline SVG renderer, so the app does not need internet access for the MVP.

## Run Locally

```powershell
cd C:\Users\tom1\Desktop\gridassetlink.dev\python_desktop_app
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

For backend-only development:

```powershell
python main.py --server-only --port 8787
```

Then open `http://127.0.0.1:8787`.

To recreate the bundled demo SQLite database:

```powershell
python main.py --reset-demo-data
```

## Dashboard Features

- Offline interactive SVG map.
- Layer controls for substations, transmission lines, distribution poles, structures, OPGW routes, fiber spans, splice points, devices, circuits, services, and work orders.
- Existing vs proposed/design lifecycle filtering.
- Asset search and status filtering.
- Clickable map assets and result rows with detail panels.
- Dependency tracing for services, devices, circuits, fibers, splice points, substations, and work orders.
- Create/edit/delete workflows for synthetic records.
- Create distribution poles, fiber spans, splice points, devices, substations, circuits, and services.
- GeoJSON export of visible assets.
- CSV export of visible assets.
- GeoJSON and CSV import into the local SQLite store.
- Rule-based local command panel:
  - `create pole`
  - `create fiber span`
  - `create splice point`
  - `show circuits on this fiber`
  - `trace service`
  - `list devices at substation`
  - `show high risk nodes`
  - `export geojson`

## Packaging

Build a Windows executable with PyInstaller:

```powershell
cd C:\Users\tom1\Desktop\gridassetlink.dev\python_desktop_app
.\.venv\Scripts\Activate.ps1
python build_exe.py
```

Expected output:

```text
python_desktop_app\dist\GridAssetLink.exe
```

The executable bundles the static frontend and seed data. In packaged mode, the writable SQLite database defaults to:

```text
%LOCALAPPDATA%\GridAssetLinkDesktop\gridassetlink_demo.sqlite
```

Use `GRIDASSETLINK_DATA_DIR` or `GRIDASSETLINK_DB_PATH` in `.env` to override local storage.

## Import Formats

GeoJSON imports require a `FeatureCollection`. Each feature should include:

```json
{
  "type": "Feature",
  "id": "POLE-DEMO-001",
  "geometry": { "type": "Point", "coordinates": [-71.2, 42.3] },
  "properties": {
    "asset_type": "distribution_pole",
    "name": "Demo Pole",
    "status": "proposed",
    "lifecycle": "proposed"
  }
}
```

CSV imports support these columns:

```text
id,asset_type,name,status,lifecycle,longitude,latitude,geometry_json,properties_json
```

For point records, `longitude` and `latitude` are enough. For line or polygon records, provide `geometry_json`.

## Future OpenAI Assistant Adapter

`backend/assistant_adapter.py` defines a clean boundary for replacing the local deterministic command handler with an OpenAI-backed assistant later. The MVP intentionally does not import an OpenAI SDK or hard-code credentials. Keep API keys in `.env` or another approved secret source.

