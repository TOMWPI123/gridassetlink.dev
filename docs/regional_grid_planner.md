# RegionalGrid Planner

RegionalGrid Planner is a New England-scale planning demo for public grid reference imports and internal telecom overlays. Public records are treated as geospatial references only. Synthetic SEL ICON nodes, assumed OPGW routes, fiber paths, circuits, and work orders are fictional planning data unless a user later marks them as user-verified or engineering-record verified.

## Public Data Rules

- Import public/open datasets only.
- Do not scrape restricted, login-only, confidential, CEII, or proprietary utility data.
- Do not infer private telecom topology from public transmission or substation records.
- Keep generated OPGW, SEL ICON, private fiber, and circuit records labeled as assumed, synthetic, proposed, or user-verified.
- Do not store credentials, protection settings, or sensitive operational access details.

## Import Adapters

Adapters live in `backend/app/integrations/public_grid_sources/`.

- `opengridworks_adapter.py`
- `iso_ne_public_adapter.py`
- `osm_power_adapter.py`
- `geojson_importer.py`
- `shapefile_importer.py`
- `csv_grid_importer.py`

The mock adapters return fictional public-reference style records. Replace their mock inputs with user-uploaded public exports or approved internal reference files. Do not hardcode private API keys.

## OPGW Assumption Engine

Assumed OPGW routes are planning hypotheses, not active fiber. Converting an assumption creates `FiberCable`, `FiberSegment`, and `FiberStrand` records with `planned_assumed` status. A separate as-built review must verify the route before it can become verified operational planning data.

Default fiber-count assumptions:

- 115 kV: 24F planning option
- 230 kV: 48F planning option
- 345 kV: 72F planning option
- Unknown voltage: manual engineering input required

## Map TODO

The API exposes map-ready layer payloads at `/api/regional-grid/map`. The frontend currently renders a dependency-free placeholder. When frontend map dependencies are approved, wire those payloads into Leaflet or MapLibre with filters for state, owner, voltage class, asset type, assumed versus verified status, ring, circuit service type, work order status, and user-visible assets only.
