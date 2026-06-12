# Database Administration

GridAssetLink uses account-gated administration for synthetic planning records.

## Accounts

Seeded demo accounts are available after the backend seed step:

- `admin@example.com` / `admin123`
- `engineer@example.com` / `engineer123`
- `fieldtech@example.com` / `fieldtech123`
- `viewer@example.com` / `viewer123`
- `sqlanalyst@example.com` / `sql123`

Authentication is enabled by default. Set `AUTH_REQUIRED=false` on the backend and `NEXT_PUBLIC_ENABLE_AUTH=false` on the frontend only for local development bypass mode.

## Admin Workflow

1. Sign in as an `admin`, `engineer`, or `editor`.
2. Open `/admin/database`.
3. Install the core TelecomNE rebuild schemas or create a custom object type.
4. Add records with properties JSON and optional GeoJSON geometry.
5. Open `/dashboard?drawer=design` to view map records on the Design Mode planning layer.
6. Use Design Mode to draw, edit, search, select, archive, export, import, materialize records, or issue work orders from selected records.

Object types with `point`, `line`, or `polygon` geometry appear on the dashboard map when the Design Mode layer is visible. `table_only` records stay in the database and are useful for inspections, assumptions, vendors, permits, notes, inventories, and other non-map objects.

## In-App Guide

`/admin/database` includes a **Design database guide** section that acts as the first-stop checklist for using GridAssetLink as a living planning database.

The dashboard also includes a **Guide** button next to **In Service** and **Planned**. Open it from `/dashboard?drawer=guide` to view workflows and create synthetic example database edits directly into Design Mode.

- Choose templates or core schemas before creating records.
- Edit selected records instead of recreating them.
- Use statuses as design workflow gates.
- Issue work orders from records that need field or engineering action.
- Materialize supported records only after review.
- Preserve the synthetic/demo data boundary.

The dashboard guide can upsert example Design Mode records for:

- adding fiber and slack to a distribution pole,
- adding a fiber cable/span between structures,
- resplicing an existing service with existing and proposed splice rows, and
- assigning a service from one substation LIU to another LIU with endpoint devices.

Each guide action runs `POST /api/design-assets/blueprint/import` with `mode: upsert`. The records are synthetic/demo planning records and should be reviewed before materialization or work-order issue.

### Assigning a Service Across Fiber

Use this sequence when modeling a service from one substation LIU to another substation LIU with devices on both ends:

1. Create or select the A-end and Z-end substations.
2. Add the LIU or patch panel at each substation with rack, panel, port count, and port identifiers.
3. Add endpoint devices at both ends, including device type, rack, device ports, and LIU termination ports.
4. Add the fiber cable or route between the substations, then create strand records with tube/color, strand number, and status.
5. Add splice closures and splice matrix rows for terminal, inline, tap, or transition splices.
6. Create a circuit or service record and attach the endpoint devices, device ports, LIU ports, cable IDs, strand numbers, and splice IDs.
7. Save the fiber assignment as `proposed` or `planned`, validate continuity/loss/conflicts, then issue a work order if field work is required.
8. Move the assignment to `as_built` only after field evidence and engineering review.

Capture these elements for a complete assignment:

- A-end and Z-end substation records
- LIU or patch panel records at both ends
- Endpoint device and device port records
- Fiber cable, route, segment, and strand records
- Splice closure, splice point, and splice matrix records
- Circuit/service record with service type and criticality
- Fiber assignment with cable IDs, strand numbers, splice IDs, and status
- Continuity trace, estimated loss, work order, evidence, and closeout status

Example synthetic assignments:

- `87L-MA-WBS-AUB-101`: C37.94 / 87L protection service from `WBS-SEL411L-01` to `AUB-SEL411L-01`, using `WBS-LIU-01` to `AUB-LIU-01`, `SYN-OPGW-WBS-AUB-48F`, strands 1-2, and terminal/inline splice rows.
- `SCADA-MA-WOR-FRA-204`: SCADA Ethernet VLAN service from `WOR-SW-01` to `FRA-RTU-01`, using `WOR-LIU-02` to `FRA-LIU-01`, `SYN-ADSS-WOR-FRA-96F`, strands 37-38, and a SCADA field-verification work order.
- `DS1-MIG-MA-MIL-WBS-033`: Leased DS1 migration from `MIL-NID-01` to `WBS-ICON-01`, using `MIL-LIU-01` to `WBS-LIU-03`, `SYN-OPGW-MIL-WBS-72F`, strands 11-12, and a migration work order with rollback evidence.

## Design/Edit Usability

Use these patterns to keep the design database easier to operate:

- Start common work from templates: distribution poles, splice closures, fiber spans, work packages, and patch panels.
- Use the record browser to filter by status, work-order linkage, object type, or search text before editing.
- Select a record, update properties/geometry/notes in one editor, then save instead of recreating records.
- Duplicate a record when designing similar nearby assets; duplicated records intentionally do not inherit old work-order links.
- Move records through status states such as `proposed`, `planned`, `in_review`, `active`, and `as_built`.
- Review recent design events before issuing field work or marking a record as verified.

## Materialization

Design records are the staging layer. Some core object types include backend materialization rules that can write supported records into canonical module tables such as:

- substations
- circuits
- devices and device ports
- distribution poles and structures
- OPGW/fiber cables
- fiber strands
- splice points and splice records
- patch panels and panel ports
- fiber assignments
- work orders

Use materialization only for synthetic/demo planning records. It does not verify real-world assets.

## Living Database Work Orders

Design records can issue real work-order records while staying linked to the original design object. Use this when the tool is acting as a design database and field or engineering work needs to be assigned.

- Dashboard: open `/dashboard?drawer=design`, select a Design Mode record, then click **Issue work order**.
- Administration: open `/admin/database` and use **Living database work queue**.
- API: `POST /api/design-assets/records/{record_id}/issue-work-order`.

The work order receives default review, verification, closeout, and engineering-review tasks unless task titles are supplied in the request. The design record stores `linked_work_order_ids`, `latest_work_order_id`, `latest_work_order_number`, `work_order_status`, and `living_database_status` in its properties JSON.

Work-order closeout does not automatically mark a synthetic asset verified. Update the design record to `as_built` only after an engineer reviews field evidence and confirms the record should be treated as verified planning data.

## Data Boundary

All admin-created objects must remain synthetic/demo data unless a future import workflow explicitly labels them verified.

Do not enter CEII, SCADA, relay/protection, operational telecom, credentials, private fiber-route data, switching information, dispatch information, or engineering-critical settings.
