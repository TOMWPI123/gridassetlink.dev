# API

OpenAPI docs are available at `http://localhost:8000/docs`.

Core patterns:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/{entity}`
- `POST /api/{entity}`
- `GET /api/{entity}/{id}`
- `PUT /api/{entity}/{id}`
- `DELETE /api/{entity}/{id}`

Authentication is enabled by default. Use a bearer token returned by `/api/auth/login` for CRUD and administration calls. Writes require `admin` or `engineer` except `users` and `audit-logs`, which are admin-only.

Special endpoints include `/api/dashboard/summary`, `/api/circuits/{id}/trace`, `/api/circuits/{id}/fiber-path`, `/api/fiber-assignments`, `/api/fiber-cables/{id}/strand-assignments`, `/api/fiber-cables/{id}/splice-map`, `/api/splice-closures/{id}/trays`, `/api/splice-closures/{id}/splices`, `/api/patch-panels/{id}/port-map`, `/api/devices/{id}/fiber-connectivity`, `/api/work-orders/{id}/fiber-tasks`, `/api/fiber-cables/{id}/impact`, `/api/splice-closures/{id}/impact`, `/api/work-orders/my`, `/api/work-orders/{id}/closeout`, `/api/sql/select`, `/api/reports/saved`, `/api/import/csv`, `/api/export/{entity}`, and `/api/qr/generate`.

Design/database administration endpoints live under `/api/design-assets`. The primary routes are:

- `GET /api/design-assets/map-records`
- `POST /api/design-assets/asset-types`
- `POST /api/design-assets/records`
- `PUT /api/design-assets/records/{id}`
- `DELETE /api/design-assets/records/{id}`
- `POST /api/design-assets/records/{id}/materialize`
- `POST /api/design-assets/records/{id}/issue-work-order`
- `POST /api/design-assets/materialize`
- `GET /api/design-assets/module-blueprints`
- `POST /api/design-assets/module-blueprints/{key}/install`
- `GET /api/design-assets/agent-tools`
- `POST /api/design-assets/agent-tools/{tool_key}/run`

`issue-work-order` creates a `work_orders` row plus default `work_order_tasks`, then links the issued work order back into the design record properties.

These endpoints are for synthetic/demo planning data only.
