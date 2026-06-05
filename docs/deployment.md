# Deployment

Run locally with:

```bash
docker compose up --build
```

## Vercel

This repo includes `vercel.json` using Vercel Services:

- `web`: `frontend/` mounted at `/`
- `api`: `backend/main.py` mounted at `/backend`

Set the Vercel project Framework Preset to **Services**. The frontend calls `NEXT_PUBLIC_API_URL` when Vercel injects it for the `api` service, and falls back to `/backend` on non-local hosts.

For durable production data, set `DATABASE_URL` to managed PostgreSQL/PostGIS in the API service environment. If no database URL is provided on Vercel, the API seeds a demo SQLite database in `/tmp`.
