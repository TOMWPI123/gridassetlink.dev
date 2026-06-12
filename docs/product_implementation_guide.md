# GridAssetLink Product Implementation Guide

This document is the product handoff guide for implementing GridAssetLink from a fresh start as a no-account, map-first telecom and utility asset-management design database.

GridAssetLink is a synthetic planning demo. Public transmission, public substation, FCC, and basemap layers are reference-only. Generated transmission structures, OPGW, distribution poles, splices, fiber strands, patch panels, devices, services, circuits, and work orders are synthetic/demo records unless a future import workflow explicitly marks them verified.

Do not enter CEII, SCADA, relay/protection settings, credentials, operational telecom access, switching, dispatch, private fiber-route data, or real utility operating information.

## 1. Product Shape

GridAssetLink should feel like a professional asset-management product with the map as the primary workspace.

Core surfaces:

- `/dashboard`: full-screen map for browsing public references, synthetic telecom layers, Design Mode, search, filters, and selected asset details.
- `/guide`: standalone product guide and implementation playbook loaded from the backend.
- `/admin/database`: no-account database designer for object types, records, map geometry, blueprints, materialization, and work-order issue.
- Module pages: substations, transmission lines, transmission structures, OPGW, distribution fiber, fiber cables, fiber strands, fiber assignments, splice closures, splice points, patch panels, devices, device ports, circuits, work orders, fiber trace, outage impact, SQL reports, import/export, data sources.
- Backend OpenAPI: `/docs`, with `/api/implementation-guide` as the backend-served handoff guide.

The dashboard Guide button must navigate to `/guide`, not open an account-gated drawer.

## 2. No-Account Mode

The MVP is no-account by default.

Required behavior:

- `AUTH_REQUIRED=false` in the backend.
- `NEXT_PUBLIC_ENABLE_AUTH=false` in the frontend.
- No login, logout, account chip, account dropdown, account settings, Users page, or Audit Log page in normal navigation.
- `/login`, `/admin/users`, and `/admin/audit-log` redirect away from account surfaces.
- Backend endpoints that still need an actor use the internal demo engineer identity.
- Stale browser tokens are ignored when backend auth is disabled so old sessions do not trigger `Token expired`.

Implementation notes:

- Keep auth code isolated rather than deleting it aggressively. A production hardening phase can re-enable authentication later.
- The no-account demo still needs event history, work-order author fields, and materialization metadata. Use the demo engineer for those fields.
- Do not present the no-account demo as secure multi-user production access.

## 3. Fresh-Start Build Order

### Phase 1: Base Platform

Build the backend and frontend skeleton before telecom-specific workflows.

Deliverables:

- FastAPI app in `backend/app/main.py`.
- SQLModel database setup and seed loader.
- Next.js App Router shell.
- `/dashboard` default route.
- `/guide` standalone route.
- Global demo disclaimer.
- Public data source documentation.

Backend setup:

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
python -m app.seed.seed
uvicorn app.main:app --reload
```

Frontend setup:

```bash
cd frontend
npm install
npm run dev
```

### Phase 2: Canonical Asset Schema

Create canonical module tables first, then add design records on top.

Canonical asset domains:

- Substations and regional substations.
- Public transmission lines and synthetic transmission structures.
- Devices, cards, ports, SEL ICON nodes, operational placeholders.
- OPGW and distribution fiber cables.
- Fiber strands, assignments, splice closures, splice points, splice matrix rows.
- Patch panels and patch-panel ports.
- Circuits, services, leased services, providers.
- Work orders, tasks, closeout, evidence placeholders.
- SQL reports and import/export metadata.

Every table or record type should include, where applicable:

- stable ID or record key
- display label
- status
- source
- synthetic/demo flag
- notes
- geometry or location reference
- owner/source confidence when derived from public data
- work-order or proposed-change link

### Phase 3: Public Reference Layers

Load only public/open data.

Rules:

- HIFLD transmission lines are read-only public reference geometry.
- Public substation nodes are added only when utility owner can be verified from public data or compatible public tags.
- FCC tower and microwave layers are public FCC reference records filtered to utility-like licensees inside the map area.
- OpenStreetMap can enrich owner/operator tags, but attribution and uncertainty must remain visible.
- Public transmission records never prove private OPGW, protection channels, SCADA paths, SEL ICON services, leased circuits, or operational telecom routes.

Implementation artifacts:

- Public ingestion scripts under `frontend/scripts`.
- Data source records in `frontend/data/dataSources.ts`.
- `/data-sources` page and dashboard Sources drawer.
- Map layers for transmission lines, substations, FCC towers, and FCC microwave paths.

### Phase 4: Synthetic Planning Data

Generate deterministic synthetic data after public references exist.

Required generators:

- transmission structures along public transmission geometry
- synthetic OPGW routes and cable sections
- fiber strands
- splice closures and splice matrix records
- patch panels and patch-panel ports
- fiber assignments and service paths
- synthetic SEL ICON nodes, services carried, provisioning parameters, cards, ports, and circuits
- distribution poles, spans, slack loops, splice points, handholes, mux sites, routes, and assignments

Validation rules:

- OPGW references valid transmission line and structure IDs.
- Strands reference valid cables.
- Splices reference valid closures, cables, and strands.
- Assignments reference valid cable, strand, splice, endpoint, and service IDs.
- Patch panels reference valid structures, substations, or telecom nodes.
- No strand is double-booked unless a planned override explicitly allows it.
- Synthetic assumptions are not active fiber.

### Phase 5: Map-First Dashboard

The dashboard should be optimized for browsing and design.

Core dashboard features:

- In Service and Planned mode buttons.
- Design Mode button.
- Guide button that navigates to `/guide`.
- Layer drawer with public and synthetic layer groups.
- Search by layer.
- Visibility filters.
- Clickable asset detail panels.
- OPGW route, cable-section, splice, patch panel, assignment, distribution, FCC, substation, and transmission layers.
- Active layer summary at the bottom of the map.
- Map interactions that store only selected asset details in React state.

For large distribution data, use backend vector tiles and click-to-load detail endpoints instead of loading raw records in the browser.

### Phase 6: Design Database

The design database is the user-editable staging layer.

Implement:

- `DesignAssetType`: user-defined object type, fields, geometry type, search fields, and map style.
- `DesignAssetRecord`: individual record with status, properties, geometry, source, visibility, notes, and event history.
- Blueprint import/export.
- Core telecom rebuild schemas.
- Dashboard Design Mode map layer.
- Database Admin forms.
- Record browser and editor.
- Materialization into canonical module tables after review.
- Work-order issue from selected design records.

Supported object examples:

- distribution pole
- fiber span
- OPGW cable
- fiber strand
- splice point
- fiber splice row
- patch panel
- patch panel port
- device
- device port
- circuit/service
- fiber assignment
- work package
- generic database object

### Phase 7: Fiber, Splicing, and Service Workflows

Workflows should be linked by stable IDs rather than isolated records.

Add a service between two substations:

1. Create A-end and Z-end substation/site records.
2. Create LIU or patch-panel records at both substations.
3. Create endpoint devices and device ports.
4. Create or select fiber cable and route records.
5. Generate or reserve strand records.
6. Create terminal and inline splice rows.
7. Create the service/circuit record with service type, criticality, endpoints, devices, ports, strand IDs, splice IDs, and status.
8. Validate continuity, loss, conflicts, and evidence requirements.
9. Issue a work order if field work is required.
10. Move to as-built only after evidence and engineering review.

Insert a pole in a preexisting pole line:

1. Stage the new pole/support point.
2. Preserve the original span as a reference.
3. Create split span A-to-new and new-to-Z records.
4. Link affected cable, fiber route, slack, and splice needs.
5. Create a proposed change package with a rollback plan.
6. Issue field verification or make-ready work order.
7. Materialize only after review.

Insert a splice:

1. Select the cable/span or structure.
2. Create a proposed splice point/closure.
3. Add proposed splice rows for affected strands.
4. Link affected services and assignments.
5. Estimate splice loss.
6. Create required evidence checklist.
7. Issue work order.
8. Keep existing splice rows read-only until approval.

### Phase 8: Work Orders

Work orders turn proposed design into executable work.

Each work order should include:

- title
- work type
- related asset/source design record
- affected cable/strand/splice/device/patch panel/circuit IDs
- priority
- status
- required tasks
- evidence requirements
- safety/impact flags
- field closeout notes
- engineering review state

Closeout does not automatically verify a synthetic asset. Verification is a separate engineering/as-built action.

### Phase 9: GIS Scale

Do not render millions of poles directly in the browser.

Scale architecture:

- PostGIS source of truth.
- Spatial indexes on poles, spans, routes, splice cases, mux sites, handholes, slack loops, and territories.
- Server-side vector tiles at `/api/tiles/{layer}/{z}/{x}/{y}.mvt`.
- Zoom-dependent level of detail.
- Tile caching and dirty-tile invalidation.
- Background synthetic generation workers.
- Server-side search and trace.
- Click-to-load details.

Low zooms should show summaries and density. Individual poles should appear only at street zoom.

## 4. Backend API Surfaces

Guide:

- `GET /api/implementation-guide`
- `GET /api/implementation-guide/markdown`

Design assets:

- `GET /api/design-assets/map-records`
- `POST /api/design-assets/asset-types`
- `POST /api/design-assets/records`
- `PUT /api/design-assets/records/{id}`
- `DELETE /api/design-assets/records/{id}`
- `POST /api/design-assets/blueprint/import`
- `GET /api/design-assets/rebuild-package`
- `POST /api/design-assets/rebuild-package/import`
- `POST /api/design-assets/records/{id}/materialize`
- `POST /api/design-assets/materialize`
- `POST /api/design-assets/records/{id}/issue-work-order`

GIS scale:

- `GET /api/tiles/{layer}/{z}/{x}/{y}.mvt`
- `POST /api/service-territories/import-geojson-file`
- `POST /api/road-centerlines/import-geojson-file`
- `POST /api/service-territories/{id}/generate-synthetic-assets`
- `GET /api/assets/pole/{pole_id}`
- `GET /api/assets/{asset_type}/{asset_id}`
- `GET /api/search`
- `POST /api/trace/fiber`
- `POST /api/trace/circuit`
- `POST /api/trace/span-impact`

Canonical modules:

- `GET /api/substations`
- `GET /api/devices`
- `GET /api/device-ports`
- `GET /api/fiber-cables`
- `GET /api/fiber-strands`
- `GET /api/fiber-assignments`
- `GET /api/splice-closures`
- `GET /api/patch-panels`
- `GET /api/circuits`
- `GET /api/work-orders`

## 5. Frontend Implementation Checklist

- Dashboard opens at `/dashboard` from `/`.
- Dashboard Guide button opens `/guide`.
- `/guide` fetches backend guide content from `/api/implementation-guide`.
- Sidebar includes asset modules and Database Admin, but not Accounts or Audit Log.
- Topbars show "No-account synthetic demo", not a user profile.
- Login/account pages redirect away from account management.
- Global disclaimer appears.
- Data-sources page is linked.
- Design Mode can create and edit records without raw JSON.
- Work orders can be issued from design records.
- Map layers are toggleable and searchable.
- Continuity and outage views show selected/filter-relevant context.

## 6. Handoff Acceptance Checklist

- App runs locally with `docker compose up --build`.
- Backend `/api/health` returns ok.
- Backend `/api/implementation-guide` returns the product guide JSON.
- `/dashboard` loads without login.
- `/guide` loads the backend guide.
- `/admin/database` opens without login and can create synthetic design records.
- Dashboard Guide button navigates to `/guide`.
- Accounts and Audit Log are not present in normal navigation.
- Public and synthetic data boundaries are visible.
- Frontend typecheck and build pass.
- Backend tests pass or any remaining test gaps are documented.

## 7. Future Production Hardening

The current target is a no-account synthetic planning product. If this becomes a real multi-user system, add production controls in a separate hardening phase:

- authentication and SSO
- role-based access control
- tenant/utility owner boundaries
- audit log review tools
- secrets management
- encrypted storage for sensitive metadata
- import approval gates
- operational data redaction
- CEII handling policy
- backup/restore plan
- observability, rate limiting, and incident response

Do not mix those hardening changes with the no-account demo unless the product requirement changes.
