# Public Grid Source Adapters

RegionalGrid Planner imports public-reference grid data only. These adapters are designed for user-uploaded exports from public sources such as OpenGridWorks, ISO New England public reference maps, OpenStreetMap power infrastructure exports, CSV, GeoJSON, and Shapefile-derived tabular records.

Safety rules:

- Do not scrape restricted, login-only, CEII, confidential, or proprietary data.
- Do not store API credentials in these adapters.
- Preserve source attribution and import batch history.
- Treat imported substations and transmission lines as public geospatial references.
- Treat generated OPGW, SEL ICON, fiber, and circuit overlays as assumed, synthetic, proposed, or user-verified until engineering records prove otherwise.

Expected normalized shape:

```json
{
  "sources": [],
  "substations": [],
  "transmission_lines": [],
  "structures": [],
  "owners": [],
  "validation": {}
}
```

The mock adapters return fictional New England planning references for demo use. Replace them with parsers for authorized public exports as needed.

