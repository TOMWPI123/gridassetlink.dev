# Database Administration

GridAssetLink uses no-account administration for synthetic planning records. The backend supplies an internal demo engineer identity for edit history, materialization metadata, and work-order issue flows.

## No-Account Mode

The default product mode is:

- `AUTH_REQUIRED=false`
- `NEXT_PUBLIC_ENABLE_AUTH=false`

The app does not show sign-in, sign-out, account settings, Users, or Audit Log pages in normal navigation. The auth code remains isolated for a future production hardening phase, but the current MVP should be usable without account setup.

## Admin Workflow

1. Open `/admin/database`.
2. Install the core TelecomNE rebuild schemas or create a custom object type.
3. Add records with guided forms, templates, map drawing tools, and action buttons.
4. Open `/dashboard?drawer=design` to view map records on the Design Mode planning layer.
5. Use Design Mode to draw, edit, search, select, archive, export, import, materialize records, or issue work orders from selected records without hand-writing database payloads.
6. Open `/guide` for the backend-served product handoff guide and workflow examples.

Object types with `point`, `line`, or `polygon` geometry appear on the dashboard map when the Design Mode layer is visible. `table_only` records stay in the database and are useful for inspections, assumptions, vendors, permits, notes, inventories, and other non-map objects.

## In-App Guide

`/admin/database` includes a **Design database guide** section that acts as the first-stop checklist for using GridAssetLink as a living planning database.

The dashboard also includes a **Guide** button next to **In Service** and **Planned**. Open it from `/dashboard?drawer=guide` to view workflows and create synthetic example database edits directly into Design Mode with buttons.

- Choose templates or core schemas before creating records.
- Edit selected records instead of recreating them.
- Use statuses as design workflow gates.
- Issue work orders from records that need field or engineering action.
- Materialize supported records only after review.
- Preserve the synthetic/demo data boundary.

The dashboard guide can create or update example Design Mode records for:

- adding fiber and slack to a distribution pole,
- adding a fiber cable/span between structures,
- resplicing an existing service with existing and proposed splice rows, and
- assigning a service from one substation LIU to another LIU with endpoint devices.

The guide also includes a **Create complete guide package** button and coverage cards for the major database areas. The records are synthetic/demo planning records and should be reviewed before materialization or work-order issue.

Coverage cards:

- **Substations, LIUs, and patch panels**: site anchor records, LIUs, patch panels, racks, ports, and endpoint inventory.
- **Distribution poles and spans**: pole/support records, cable IDs, span endpoints, slack, and planned fiber construction state.
- **Strands, services, and continuity**: strand rows, reservations, assignments, service IDs, LIU terminations, and loss/continuity summaries.
- **Splicing and resplicing**: existing splice rows, proposed splice rows, affected service IDs, and closeout requirements.
- **Work orders, evidence, and closeout**: linked records, required tasks, evidence requirements, field status, and engineering review.
- **Import, rebuild, and materialization**: import source, validation state, record counts, materialization mode, and review notes.

Use the guide as the no-code update path:

1. Click **Guide** on the dashboard.
2. Choose a coverage card such as **Splicing and resplicing** or **Work orders, evidence, and closeout**.
3. Click **Create related examples** to add the supporting records.
4. Click **Open Design records** to inspect or edit the created records.
5. Click **Open module** to review the matching module page.
6. Issue work orders or materialize records only after review.

## No-Code Object Editing

The normal update path should be buttons and forms, not hand-written payloads:

- Use **Recommended design/edit improvements** to load a pole, splice closure, fiber span, work package, or patch panel template.
- Use **Form fields** to add or remove the fields that users should fill in.
- Use **Map style** controls to pick color, point radius, line width, and fill opacity.
- Use **Create database object** to fill in typed fields such as cable ID, fiber count, connected cable IDs, strand status, LIU port, or notes.
- Use **Map location**, **Route endpoints**, or dashboard drawing tools for geometry.
- Use the **Record browser and editor** to update existing records from the generated fields, then save, duplicate, archive, or issue a work order.

Collapsed advanced backup sections exist only for troubleshooting or imported/exported schema recovery. Day-to-day design changes should use the visual field builder, typed record forms, guide buttons, and dashboard map drawing.

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
- Guide: open `/dashboard?drawer=guide`, create the related guide examples, then open Design records and issue work from the selected record.
- Administration: open `/admin/database` and use **Living database work queue**.

The work order receives default review, verification, closeout, and engineering-review tasks. The design record keeps the latest work-order link, status, and living-database state in its record metadata.

Work-order closeout does not automatically mark a synthetic asset verified. Update the design record to `as_built` only after an engineer reviews field evidence and confirms the record should be treated as verified planning data.

## Data Boundary

All database-created objects must remain synthetic/demo data unless a future import workflow explicitly labels them verified.

Do not enter CEII, SCADA, relay/protection, operational telecom, credentials, private fiber-route data, switching information, dispatch information, or engineering-critical settings.
