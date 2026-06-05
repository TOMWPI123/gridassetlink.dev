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
