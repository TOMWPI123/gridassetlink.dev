# API

OpenAPI docs are available at `http://localhost:8000/docs`.

Core patterns:

- `POST /api/auth/login`
- `GET /api/{entity}`
- `POST /api/{entity}`
- `GET /api/{entity}/{id}`
- `PUT /api/{entity}/{id}`
- `DELETE /api/{entity}/{id}`

Special endpoints include `/api/dashboard/summary`, `/api/circuits/{id}/trace`, `/api/circuits/{id}/fiber-path`, `/api/fiber-assignments`, `/api/fiber-cables/{id}/strand-assignments`, `/api/fiber-cables/{id}/splice-map`, `/api/splice-closures/{id}/trays`, `/api/splice-closures/{id}/splices`, `/api/patch-panels/{id}/port-map`, `/api/devices/{id}/fiber-connectivity`, `/api/work-orders/{id}/fiber-tasks`, `/api/fiber-cables/{id}/impact`, `/api/splice-closures/{id}/impact`, `/api/work-orders/my`, `/api/work-orders/{id}/closeout`, `/api/sql/select`, `/api/reports/saved`, `/api/import/csv`, `/api/export/{entity}`, and `/api/qr/generate`.
