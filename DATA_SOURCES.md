# Data Sources and Attribution

GridAssetLink is a no-auth synthetic planning demo. It uses public grid reference layers for map context and generated demo data for telecom/fiber planning overlays.

## Public Reference Sources

| Source | Use in GridAssetLink | Handling |
| --- | --- | --- |
| [HIFLD Electric Power Transmission Lines](https://www.arcgis.com/home/item.html?id=13b4728b7403404cb72b52b5367a1ad6) | Public transmission-line geometry for ISO New England map context. | Imported from a public ArcGIS FeatureServer, converted to WGS84 GeoJSON, clipped to Connecticut, Massachusetts, Rhode Island, New Hampshire, Vermont, and Maine, and rendered read-only. Transmission owner buckets use the public HIFLD `OWNER` field when present, then close OpenStreetMap power-line owner/operator tag matches with compatible voltage, then explicit utility owner tokens in public line names; otherwise records remain `Unknown public owner`. |
| [HIFLD Electric Substations](https://services5.arcgis.com/HDRa0B57OVrv2E1q/ArcGIS/rest/services/Electric_Substations/FeatureServer/0) | Public substation reference points. | Displayed only when owner/operator can be verified from public source data or a close OpenStreetMap owner/operator tag match. Unknown-owner and nearest-line-only inferred records are excluded. |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) via Overpass API | Public `power=line`, `power=minor_line`, `power=cable`, and `power=substation` owner/operator tag enrichment and map attribution. | Used only as public reference enrichment. Transmission-line matches require close public geometry alignment and compatible voltage before owner buckets are assigned from OSM. OpenStreetMap data is attributed to OpenStreetMap contributors and is subject to the Open Database License. |
| [FCC ULS Microwave Public Access Files](https://data.fcc.gov/download/pub/uls/complete/l_micro.zip) | Public utility-licensee microwave tower/site nodes and point-to-point path references. | Generated from public FCC ULS license, entity, microwave, location, path, and frequency tables. The dashboard exposes FCC tower/site nodes and FCC microwave path links as two separate read-only layers; path links include assigned-frequency group filters. Records are included only when the public licensee name matches a utility-owner pattern and FCC coordinates are inside CT, MA, RI, NH, VT, or ME. Parameters such as call sign, path number, frequency, EIRP, ASR number, and structure height are public license fields only and are not private operational route verification. |
| [CARTO basemap tiles](https://docs.carto.com/faqs/carto-basemaps) | Visual background tiles for the MapLibre dashboard. | Used as a basemap only. Planning overlays are stored separately and remain clearly labeled. |

## Generated Demo Data

Transmission structures, synthetic OPGW cables, fiber strands, splice closures, splice records, patch panels, fiber assignments, telecom circuits, SEL ICON examples, work orders, and proposed changes are generated or seeded demo/planning records.

These records do not represent real utility assets. They must not be used for operations, switching, dispatch, protection, restoration, SCADA, telecom routing, or CEII-restricted analysis.

## Current Generated Files

Public reference outputs:

- `frontend/public/data/iso-ne-public-transmission-lines.geojson`
- `frontend/public/data/iso-ne-public-transmission-lines.meta.json`
- `frontend/public/data/iso-ne-public-substations.geojson`
- `frontend/public/data/iso-ne-public-substations.meta.json`
- `frontend/public/data/fcc-uls-utility-towers.geojson`
- `frontend/public/data/fcc-uls-utility-microwave-links.geojson`
- `frontend/public/data/fcc-uls-utility-microwave.meta.json`

Synthetic demo outputs:

- `frontend/public/data/iso-ne-synthetic-substations.geojson`
- `frontend/public/data/iso-ne-synthetic-substations.meta.json`
- `frontend/public/data/iso-ne-synthetic-transmission-structures.geojson`
- `frontend/public/data/iso-ne-synthetic-opgw-cables.geojson`
- `frontend/public/data/iso-ne-synthetic-fiber-strands.json`
- `frontend/public/data/iso-ne-synthetic-splice-closures.geojson`
- `frontend/public/data/iso-ne-synthetic-fiber-splices.json`
- `frontend/public/data/iso-ne-synthetic-patch-panels.json`
- `frontend/public/data/iso-ne-synthetic-fiber-assignments.json`

## Regeneration Commands

Run from `frontend/`:

```bash
npm run data:transmission
npm run data:public-substations
npm run data:fcc-utility-microwave
npm run data:synthetic-substations
npm run data:fiber-network
npm run data:validate-fiber-network
```

Or refresh the full map dataset:

```bash
npm run data:map
```

## Safety Boundary

- Public transmission lines and public substations are reference layers only.
- The app does not infer real private fiber routes, OPGW, relay channels, SCADA paths, protection paths, SEL ICON services, leased circuits, or operational telecom routes from public grid records.
- HIFLD transmission-line owner sublayers are planning filters, not operational ownership verification. Line records without a public HIFLD owner field, close compatible OSM owner/operator match, or explicit utility owner token stay in `Unknown public owner`.
- FCC utility tower and microwave path layers are public ULS license references only. FCC microwave path frequency groups are display filters from public assigned-frequency fields. Do not treat FCC path records as private utility fiber, SCADA, relay, protection, or operational telecom topology.
- Do not enter real CEII, SCADA, relay, protection, telecom, credential, operational-access, or private fiber-route data.
- If future engineering records are imported, mark them as user-verified or engineering-record-verified and keep sensitive details out of public static files.
