# Database Schema

The MVP uses SQLModel tables for users, substations, racks, devices, device ports, ICON nodes, transmission lines, distribution feeders, fiber cables, fiber strands, splice closures, splice trays, fiber splices, patch panels, patch panel ports, fiber assignments, providers, circuits, circuit paths, leased services, QR codes, attachments, maintenance records, work orders, audit logs, and SQL reports.

`fiber_assignments` is the join point for strand, circuit, device, device port, patch panel port, and work-order records. It supports planned, reserved, installed, tested, active, released, and retired assignment states.

Latitude and longitude fields are included so PostGIS geometry columns can be added later.
