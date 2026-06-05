# AGENTS.md

## Project Purpose

TelecomNE Grid Asset Links is a fictional utility telecom planning MVP for substations, SEL ICON equipment, fiber assets, circuits, providers, QR links, SQL reports, and engineer-to-field-tech work orders.

This is not an official National Grid product. Use fictional sample data only.

## Build Commands

```bash
docker compose up --build
```

## Test Commands

```bash
cd backend
pytest
```

```bash
cd frontend
npm run lint
npm run typecheck
```

## Backend Setup

- FastAPI entry point: `backend/app/main.py`
- SQLModel models: `backend/app/models/assets.py`
- Seed loader: `backend/app/seed/seed.py`
- Reports: `backend/app/reports/saved_reports.py`

## Frontend Setup

- Next.js App Router root: `frontend/app`
- Shared components: `frontend/components`
- API helpers and entity config: `frontend/lib`

## Security Rules

- Never commit secrets.
- Never expose database credentials in the frontend.
- Hash passwords before storage.
- Enforce role checks in backend dependencies.
- SQL Analyst access is SELECT-only.
- Log SQL queries and administrative changes in `AuditLog`.
- Validate import data before committing.
- Use fictional sample data only.
