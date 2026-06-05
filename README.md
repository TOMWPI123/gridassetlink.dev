# TelecomNE Grid Asset Links

TelecomNE Grid Asset Links is a fictional, cloud-ready utility telecom planning and asset management platform. It tracks substations, SEL ICON networks, OPGW and distribution fiber, fiber strands, splice trays, splice closures, patch panels, fiber assignments, leased services, circuits, device connectivity, QR asset links, work orders, SQL reports, and outage/risk views.

This is not an official National Grid product. All included data is fictional sample data for demo and development only.

## Architecture

```text
Browser / field tablet
        |
        v
Next.js + React + TypeScript frontend
        |
        v
FastAPI REST API + JWT + role checks
        |
        v
SQLModel / SQLAlchemy
        |
        v
PostgreSQL in Docker, SQLite fallback locally
```

## Local Setup

```bash
cp .env.example .env
docker compose up --build
```

Backend: `http://localhost:8000`, OpenAPI docs: `http://localhost:8000/docs`, frontend: `http://localhost:3000`.

## Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
python -m app.seed.seed
uvicorn app.main:app --reload
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

## Telecom Asset Map

The `/dashboard` page is an original dark New England utility telecom planning map. It renders mock GeoJSON layers for substations, SEL ICON and telecom nodes, fiber routes, microwave paths, telecom circuits, work orders, and proposed changes.

The dashboard now supports three map modes:

- `ISO-NE Diagram`: static public planning reference with percentage-only annotations.
- `Street-Level Map`: MapLibre-backed editable lat/lon planning map for substations, nodes, lines, planning regions, and missing-location placement.
- `Hybrid Planning`: public-reference context, street-level editing, layer controls, missing-location workflow, linked asset details, and node parameter editing.

Mock map data is served from `/data/*.geojson` and lives in:

- `frontend/public/data/substations.geojson`
- `frontend/public/data/telecomNodes.geojson`
- `frontend/public/data/fiberRoutes.geojson`
- `frontend/public/data/telecomCircuits.geojson`
- `frontend/public/data/microwavePaths.geojson`
- `frontend/public/data/workOrders.geojson`
- `frontend/public/data/proposedChanges.geojson`

The map includes collapsible search and filters, layer controls, current/proposed/diff view modes, a KPI strip, clickable asset detail drawers, SEL ICON provisioning context, and a planning mode for staging synthetic proposed routes.

Production boundary: replace `frontend/lib/api/assets.ts` with authenticated API calls, RBAC, audit logging, server-side filtering, and redaction. Do not ship sensitive utility telecom topology, protection settings, credentials, or private operational details in public static files. All generated telecom routes, circuits, OPGW paths, and SEL ICON service examples in this repo are fictional, assumed, synthetic, proposed, or user-verifiable demo records.

Editable street-map seed data lives in:

- `frontend/data/transmissionMaps.ts`
- `frontend/data/substations.ts`
- `frontend/data/transmissionLines.ts`
- `frontend/data/nodeParameters.ts`
- `frontend/data/mapAnnotations.ts`

The street-level dashboard uses `maplibre-gl` installed through npm. It keeps the typed planning data and editor callbacks while rendering a MapLibre basemap with selectable GeoJSON overlays for substations, SEL ICON nodes, transmission/fiber paths, planning regions, and work-order locations.

## Public Transmission Lines and Synthetic Substations

The dashboard includes a public-reference transmission-line ingestion pipeline and deterministic synthetic substation generator for ISO New England map planning demos.

Run the full map data refresh from the frontend directory:

```bash
cd frontend
npm run data:map
```

Or run each step separately:

```bash
npm run data:transmission
npm run data:synthetic-substations
```

Generated files are stored in:

- `frontend/public/data/iso-ne-public-transmission-lines.geojson`
- `frontend/public/data/iso-ne-public-transmission-lines.meta.json`
- `frontend/public/data/iso-ne-synthetic-substations.geojson`
- `frontend/public/data/iso-ne-synthetic-substations.meta.json`

Public transmission-line ingestion uses a configurable ArcGIS REST FeatureServer source. The default is a public HIFLD Electric Power Transmission Lines mirror. Override it with:

```bash
TRANSMISSION_LINES_FEATURESERVER_URL=https://example.com/arcgis/rest/services/Transmission_Lines/FeatureServer/0
NEXT_PUBLIC_TRANSMISSION_LINES_SOURCE_NAME=HIFLD
```

The ingestion script queries public geometry only, requests WGS84 output, filters/clips to Connecticut, Massachusetts, Rhode Island, New Hampshire, Vermont, and Maine, normalizes voltage classes, keeps only map-safe display fields, and writes read-only public reference GeoJSON. If the public service fails, the script writes an empty FeatureCollection plus a metadata warning so the app continues to run.

Synthetic substation generation creates exactly 100 fake demo/planning substations with a fixed seed:

- Massachusetts: 28
- Connecticut: 18
- Maine: 18
- New Hampshire: 14
- Vermont: 12
- Rhode Island: 10

Every generated substation is labeled synthetic, private/team visibility, and includes the disclaimer `Synthetic demo/planning substation. Not a real utility asset.` The generated names intentionally include `Synthetic` and do not use real substation names or verified coordinates. If public line data is present, the generator may add a nearest-corridor planning association; that association is explicitly synthetic and not a verified physical connection.

Public transmission-line data is used for map reference only. Synthetic substations and telecom/fiber/circuit assets are demo planning records and do not represent real utility assets. This dashboard is not for operations, switching, dispatch, protection, restoration, SCADA, telecom routing, or CEII-restricted analysis.

To replace or refresh the public source, provide a different public FeatureServer URL through `TRANSMISSION_LINES_FEATURESERVER_URL`, rerun `npm run data:map`, inspect the metadata file, and verify that only public, non-sensitive display fields are retained.

## Demo Users

These credentials are demo-only:

- `admin@example.com` / `admin123`
- `engineer@example.com` / `engineer123`
- `fieldtech@example.com` / `fieldtech123`
- `viewer@example.com` / `viewer123`
- `sqlanalyst@example.com` / `sql123`

## MVP Status

Fully working: backend auth, role dependencies, schema, seed data, CRUD endpoints, dashboard metrics, SQL saved reports, SELECT-only query endpoint, circuit trace, fiber assignment validation, strand assignment grids, splice maps, patch panel port maps, device fiber connectivity, circuit fiber paths, work-order fiber tasks, outage impact, QR generation stub, CSV export, import validation stub, work-order closeout, backend tests.

Stubbed: file blob upload, Excel export, advanced GIS map rendering, advanced risk simulation, desktop packaging beyond the CLI scaffold.

## Deployment Notes

This repo includes `vercel.json` for Vercel Services: the Next.js app runs at `/` and the FastAPI API is mounted at `/backend`. The frontend uses `NEXT_PUBLIC_API_URL` when provided and otherwise falls back to `/backend` on production hosts.

For durable production data, set `DATABASE_URL` to a managed PostgreSQL/PostGIS database in the API service environment. Without it, Vercel uses the seeded SQLite demo database in `/tmp`.
