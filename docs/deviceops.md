# DeviceOps Dashboard MVP

DeviceOps separates network state into four layers:

- Actual state: read from `backend/app/integrations/operational_network_api.py` and stored as operational snapshots.
- Planned state: existing planning database records for devices, ports, circuits, fiber, work orders, and ICON assets.
- Proposed state: staged `ProposedChange` and `IconProposedService` records awaiting review, approval, and field work.
- As-built state: approved closeout/reconciled proposed changes after work order completion.

The MVP never writes to the operational network. The operational adapter is read-only and the `/api/operational/refresh` endpoint only imports snapshot data into the planning database.

## Replacing The Mock Operational API

The mock adapter lives at:

`backend/app/integrations/operational_network_api.py`

Replace the function bodies with calls to the authorized operational inventory API while keeping the same read-only function names:

- `get_devices()`
- `get_device(device_id)`
- `get_device_ports(device_id)`
- `get_icon_nodes()`
- `get_icon_node(node_id)`
- `get_icon_slots(node_id)`
- `get_icon_modules(node_id)`
- `get_icon_services(node_id)`
- `get_circuits()`
- `get_circuit(circuit_id)`
- `get_network_links()`
- `get_alarms()`
- `get_firmware_versions()`
- `get_timing_status()`
- `get_service_status()`
- `get_topology()`

Keep write methods out of this adapter unless TelecomNE explicitly authorizes live-network writes and the application configuration is changed to support them.

## SEL References

Service templates and engineering profiles use parameter fields plus `manual_reference`, `manual_revision`, and `engineering_standard_reference` placeholders. Do not copy SEL manual text into the app. Link or cite authorized internal references instead.

