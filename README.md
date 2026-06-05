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
- `Hybrid Dashboard`: side-by-side public-reference context, street-level editing, layer controls, missing-location workflow, linked asset details, and node parameter editing.

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
