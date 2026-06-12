from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

router = APIRouter(prefix="/api/implementation-guide", tags=["implementation-guide"])


DISCLAIMER = (
    "GridAssetLink is a no-account synthetic planning and asset-management demo. "
    "Public grid/FCC/source layers are reference-only. Generated poles, OPGW, splices, "
    "fiber assignments, patch panels, devices, services, work orders, and telecom planning "
    "records are synthetic/demo records unless a future import workflow explicitly marks "
    "them verified. Do not enter CEII, SCADA, relay/protection settings, credentials, "
    "operational telecom access, switching, dispatch, private fiber-route data, or real "
    "utility operating information."
)


IMPLEMENTATION_GUIDE = {
    "title": "GridAssetLink Product Implementation Guide",
    "version": "2026.06-no-account-handoff",
    "purpose": (
        "A fresh-start guide for implementing GridAssetLink as a map-first utility telecom "
        "asset-management and design database: public reference layers, synthetic planning "
        "assets, editable design records, fiber continuity, splicing, work orders, and "
        "module dashboards."
    ),
    "disclaimer": DISCLAIMER,
    "no_account_mode": {
        "enabled": True,
        "summary": "The MVP is intentionally no-account. The backend supplies a demo engineer identity internally for endpoints that still need an actor for event history, work-order creation, or materialization metadata.",
        "rules": [
            "Do not show sign-in/sign-out UI.",
            "Do not require browser tokens to use modules, design actions, imports, or work-order issue flows.",
            "Keep auth modules isolated so a future production build can re-enable them without changing the no-account demo UX.",
            "Continue to show synthetic-data and public-reference disclaimers.",
        ],
    },
    "fresh_start_phases": [
        {
            "title": "1. Stand Up the Base Platform",
            "summary": "Create the backend API, frontend shell, seed loader, and data boundary before building any telecom workflow.",
            "steps": [
                "Create a FastAPI backend with SQLModel/SQLAlchemy models and a database session dependency.",
                "Create a Next.js App Router frontend with a full-screen dashboard at /dashboard and a standalone guide at /guide.",
                "Configure CORS for localhost and the production website domain.",
                "Set AUTH_REQUIRED=false and NEXT_PUBLIC_ENABLE_AUTH=false for the no-account product mode.",
                "Add the global demo disclaimer and the data-sourcing page before adding operational-looking features.",
            ],
            "deliverables": ["Backend /api/health", "Frontend /dashboard", "Frontend /guide", "Seed command", "Synthetic/public data disclaimer"],
        },
        {
            "title": "2. Define the Canonical Asset Schema",
            "summary": "Build the database tables that make the tool useful as a living asset-management system.",
            "steps": [
                "Create substations, transmission lines, regional structures, devices, device ports, circuits, providers, work orders, and QR link records.",
                "Create OPGW/fiber cable, fiber segment, fiber strand, splice closure, splice point, fiber splice, patch panel, patch-panel port, and fiber assignment records.",
                "Create design asset types and design asset records so users can add new object types without code changes.",
                "Create proposed change and work-order tables so edits can be staged before they are treated as planned or as-built.",
                "Store source, synthetic flag, status, notes, geometry, and external reference fields on every imported or generated planning record.",
            ],
            "deliverables": ["SQLModel models", "CRUD endpoints", "Design-assets endpoints", "Work-order endpoints", "Saved SQL reports"],
        },
        {
            "title": "3. Load Public Reference Layers Safely",
            "summary": "Bring in only open/public reference layers and keep them visually distinct from synthetic telecom data.",
            "steps": [
                "Ingest public HIFLD transmission lines as read-only public reference geometry.",
                "Ingest public substations only when utility owner can be verified from public source fields or compatible public tags.",
                "Ingest FCC ULS utility tower and microwave references only from public records and only within the configured map area.",
                "Show source, license, attribution, owner-confidence, and public-reference notices in /data-sources.",
                "Never infer private OPGW, SEL ICON, protection, SCADA, leased service, or telecom topology from public grid layers.",
            ],
            "deliverables": ["Public transmission-line layer", "Verified-owner public substation layer", "FCC tower layer", "FCC microwave path layer", "Data-sources documentation"],
        },
        {
            "title": "4. Generate Synthetic Planning Layers",
            "summary": "Create deterministic demo assets that make the product useful without claiming real utility topology.",
            "steps": [
                "Generate synthetic transmission structures along public transmission geometry with stable IDs and structure numbers.",
                "Generate synthetic OPGW assumptions, cable sections, strands, splice closures, splice points, patch panels, and fiber assignments.",
                "Generate synthetic distribution poles, spans, slack loops, splice points, handholes, mux sites, distribution fiber routes, and services.",
                "Generate synthetic SEL ICON nodes, devices, cards, ports, services carried, timing/provisioning parameters, and circuits.",
                "Run validation scripts so references between cables, strands, splices, patch panels, assignments, services, and work orders stay consistent.",
            ],
            "deliverables": ["Synthetic GeoJSON/JSON layers", "Validation scripts", "Map layer toggles", "Continuity records", "Outage-impact records"],
        },
        {
            "title": "5. Build the Map-First Dashboard",
            "summary": "Make the dashboard the primary product surface for browsing, filtering, and selecting assets.",
            "steps": [
                "Use MapLibre GL for public layers, synthetic OPGW, distribution fiber, FCC references, substations, structures, splices, assignments, and design records.",
                "Add In Service, Planned, Design Mode, and Guide launch buttons above the map.",
                "Keep the Guide launch as a page navigation to /guide instead of a dashboard side panel.",
                "Implement search by layer, owner, ID, structure number, splice, cable, service, and assignment.",
                "Store only selected asset details in React state; fetch or derive large layer data through layer files, backend endpoints, or vector-tile APIs.",
            ],
            "deliverables": ["Full-screen /dashboard", "Layer drawer", "Search", "Clickable details", "Design Mode", "Guide page button"],
        },
        {
            "title": "6. Add the Design Database",
            "summary": "Let users add, edit, stage, and materialize asset-management records through forms rather than raw payloads.",
            "steps": [
                "Install core design schemas for substations, circuits, devices, device ports, poles, OPGW, strands, splices, patch panels, assignments, work orders, and generic database objects.",
                "Expose a type designer so users can create new object types, fields, geometry types, search fields, and map styles.",
                "Expose record forms, map drawing, duplication, archive, import/export, event history, and record browser tools.",
                "Support blueprint import/export so implementation packages can rebuild the database from a blank instance.",
                "Materialize reviewed design records into canonical module tables only when the object type supports it.",
            ],
            "deliverables": ["Database Admin", "Design Mode map layer", "Blueprint import/export", "Materialization", "Event history"],
        },
        {
            "title": "7. Implement Fiber, Splice, and Service Workflows",
            "summary": "Make the database function like a telecom planning tool rather than a static asset list.",
            "steps": [
                "Add a fiber strand table with status, color/tube, assignment, circuit, endpoints, notes, CSV export, and continuity view.",
                "Add an OPGW planner and cable menu that opens cable continuity, splice maps, strand assignments, services carried, and outage impact.",
                "Add an interactive splice matrix with existing rows, proposed rows, loss estimates, affected services, and commit/approve workflow placeholders.",
                "Add fiber assignment planning for reserving/assigning strands across cables, splices, patch panels, devices, and services.",
                "Add continuity trace and outage-impact views that show only the selected/filter-relevant route.",
            ],
            "deliverables": ["Fiber Strand Table", "OPGW Fiber Planner", "Splice Matrix", "Fiber Assignment Planner", "Fiber Trace", "Outage Impact"],
        },
        {
            "title": "8. Add Work Orders and Closeout",
            "summary": "Turn design intent into field/execution records without losing traceability to the source asset.",
            "steps": [
                "Allow design records, proposed changes, splices, fiber assignments, devices, and cables to generate work orders.",
                "Populate work-order tasks from service type, splice type, fiber route, patch-panel termination, evidence needs, and closeout requirements.",
                "Support field closeout status, notes, attachments/evidence placeholders, checklist items, and engineering review.",
                "Do not mark synthetic or assumed assets verified automatically after closeout; require explicit engineering/as-built review.",
            ],
            "deliverables": ["Work Orders", "Field closeout pages", "Commissioning/checklist records", "Evidence fields", "Linked source design record"],
        },
        {
            "title": "9. Prepare GIS-Scale Operation",
            "summary": "Use vector tiles and PostGIS for very large synthetic distribution datasets instead of browser-loaded GeoJSON.",
            "steps": [
                "Store service territories, telecom poles, spans, fiber routes, splice cases, slack loops, handholes, mux sites, and circuit routes in PostGIS.",
                "Serve /api/tiles/{layer}/{z}/{x}/{y}.mvt with zoom-dependent density, cluster, and detail layers.",
                "Generate million-scale synthetic poles in background jobs clipped to the service territory and public road centerlines.",
                "Cache vector tiles, dirty only affected tiles after edits, and fetch full details only after a click.",
                "Keep the dashboard responsive by avoiding raw pole arrays in React state.",
            ],
            "deliverables": ["PostGIS schema", "Vector tile API", "Generation worker", "Scale drawer", "Server-side search and trace APIs"],
        },
    ],
    "database_domains": [
        {
            "name": "Public Reference Data",
            "objects": ["public transmission lines", "verified-owner public substations", "FCC utility towers", "FCC microwave paths", "data sources"],
            "rule": "Visible as open/public context only; never treated as private telecom proof.",
        },
        {
            "name": "Transmission and OPGW Planning",
            "objects": ["transmission structures", "OPGW assumptions", "OPGW routes", "cable sections", "splice points", "strands", "patch panels"],
            "rule": "Synthetic/planned/verified status must be explicit. Assumptions are not active fiber.",
        },
        {
            "name": "Distribution Fiber Planning",
            "objects": ["distribution poles", "spans", "ADSS fiber", "slack loops", "handholes", "splice points", "distribution assignments"],
            "rule": "Use vector tiles for scale and synthetic labels for all generated assets.",
        },
        {
            "name": "Device and Service Inventory",
            "objects": ["devices", "device ports", "SEL ICON nodes", "cards", "provisioning parameters", "circuits", "services carried"],
            "rule": "Use parameterized engineering fields and placeholders; never store real protection settings or credentials.",
        },
        {
            "name": "Design, Change, and Work",
            "objects": ["design asset types", "design records", "proposed changes", "work orders", "checklists", "closeout evidence"],
            "rule": "Stage edits as proposed records, review, issue work, then materialize or mark as-built only after approval.",
        },
    ],
    "core_workflows": [
        {
            "name": "Insert a pole in a preexisting pole line",
            "records": ["new pole/support point", "split span A-to-new", "split span new-to-Z", "affected cable reference", "change package", "work order"],
            "review": ["unique new pole ID", "original span preserved", "new geometry reviewed", "field evidence required", "rollback plan captured"],
        },
        {
            "name": "Insert a splice and resplice strands",
            "records": ["splice point/closure", "proposed splice rows", "affected strand IDs", "affected services", "loss estimate", "work order"],
            "review": ["existing rows read-only", "proposed rows marked", "services linked", "loss/evidence captured", "field closeout required"],
        },
        {
            "name": "Assign a service between substations",
            "records": ["A/Z substations", "A/Z LIUs", "A/Z devices and ports", "fiber cable", "strand set", "splice IDs", "service/circuit", "fiber assignment"],
            "review": ["ports available", "strand continuity exists", "splices complete", "loss estimate acceptable", "work order linked"],
        },
        {
            "name": "Create a new database object type",
            "records": ["asset type", "form fields", "search fields", "map style", "records", "optional materialization rule"],
            "review": ["field names stable", "geometry type correct", "source/status fields included", "synthetic boundary visible"],
        },
    ],
    "api_surfaces": [
        {"area": "Guide", "routes": ["GET /api/implementation-guide", "GET /api/implementation-guide/markdown"]},
        {"area": "Design database", "routes": ["GET /api/design-assets/map-records", "POST /api/design-assets/asset-types", "POST /api/design-assets/records", "POST /api/design-assets/blueprint/import", "POST /api/design-assets/records/{id}/materialize", "POST /api/design-assets/records/{id}/issue-work-order"]},
        {"area": "GIS scale", "routes": ["GET /api/tiles/{layer}/{z}/{x}/{y}.mvt", "POST /api/service-territories/import-geojson-file", "POST /api/road-centerlines/import-geojson-file", "POST /api/service-territories/{id}/generate-synthetic-assets", "GET /api/assets/{asset_type}/{asset_id}", "GET /api/search"]},
        {"area": "Operational modules", "routes": ["GET /api/substations", "GET /api/devices", "GET /api/fiber-cables", "GET /api/fiber-strands", "GET /api/splice-closures", "GET /api/patch-panels", "GET /api/circuits", "GET /api/work-orders"]},
    ],
    "handoff_checklist": [
        "No account/login UI is visible in the normal user flow.",
        "The dashboard Guide button opens /guide as a standalone page.",
        "/guide loads the product implementation guide from the backend.",
        "All public layers show source attribution and reference-only labeling.",
        "All generated telecom/fiber records are labeled synthetic/demo/planning unless verified later.",
        "Design Mode can create object types, records, map geometry, work orders, and materialization packages.",
        "Fiber strand, splice, assignment, patch panel, circuit, and device workflows link to each other by stable IDs.",
        "Work orders preserve source-record links and evidence/closeout fields.",
        "Large distribution datasets use PostGIS/vector tiles instead of browser-loaded raw records.",
        "README and docs explain implementation, data boundaries, tests, deployment, and handoff.",
    ],
}


@router.get("")
def implementation_guide() -> dict:
    return IMPLEMENTATION_GUIDE


@router.get("/markdown", response_class=PlainTextResponse)
def implementation_guide_markdown() -> str:
    lines: list[str] = [
        f"# {IMPLEMENTATION_GUIDE['title']}",
        "",
        str(IMPLEMENTATION_GUIDE["purpose"]),
        "",
        f"**Version:** {IMPLEMENTATION_GUIDE['version']}",
        "",
        "## Data Boundary",
        str(IMPLEMENTATION_GUIDE["disclaimer"]),
        "",
        "## No-Account Mode",
        str(IMPLEMENTATION_GUIDE["no_account_mode"]["summary"]),
        "",
    ]
    for rule in IMPLEMENTATION_GUIDE["no_account_mode"]["rules"]:
        lines.append(f"- {rule}")
    lines.extend(["", "## Fresh-Start Implementation Phases", ""])
    for phase in IMPLEMENTATION_GUIDE["fresh_start_phases"]:
        lines.extend([f"### {phase['title']}", "", str(phase["summary"]), "", "Steps:"])
        lines.extend(f"- {step}" for step in phase["steps"])
        lines.extend(["", "Deliverables:"])
        lines.extend(f"- {item}" for item in phase["deliverables"])
        lines.append("")
    lines.extend(["## Database Domains", ""])
    for domain in IMPLEMENTATION_GUIDE["database_domains"]:
        lines.extend([f"### {domain['name']}", f"- Objects: {', '.join(domain['objects'])}", f"- Rule: {domain['rule']}", ""])
    lines.extend(["## Core Workflows", ""])
    for workflow in IMPLEMENTATION_GUIDE["core_workflows"]:
        lines.extend([f"### {workflow['name']}", f"- Records: {', '.join(workflow['records'])}", f"- Review: {', '.join(workflow['review'])}", ""])
    lines.extend(["## API Surfaces", ""])
    for surface in IMPLEMENTATION_GUIDE["api_surfaces"]:
        lines.extend([f"### {surface['area']}", *[f"- `{route}`" for route in surface["routes"]], ""])
    lines.extend(["## Handoff Checklist", ""])
    lines.extend(f"- {item}" for item in IMPLEMENTATION_GUIDE["handoff_checklist"])
    lines.append("")
    return "\n".join(lines)
