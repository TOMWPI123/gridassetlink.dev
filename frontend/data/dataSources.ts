export type DataSourceRecord = {
  id: string;
  name: string;
  category: "Public reference" | "Public enrichment" | "Basemap" | "Synthetic demo";
  type: "Public reference dataset" | "Public enrichment dataset" | "Public geographic basemap" | "Synthetic demo data";
  url?: string;
  lastReviewed: string;
  role: string;
  handling: string;
  notes: string;
  generatedFiles?: string[];
};

export const dataSourceRecords: DataSourceRecord[] = [
  {
    id: "hifld-transmission-lines",
    name: "HIFLD Electric Power Transmission Lines",
    category: "Public reference",
    type: "Public reference dataset",
    url: "https://www.arcgis.com/home/item.html?id=13b4728b7403404cb72b52b5367a1ad6",
    lastReviewed: "2026-06-07",
    role: "Public transmission-line geometry used as ISO New England map reference context.",
    handling: "Imported from a public ArcGIS FeatureServer, converted to WGS84 GeoJSON, clipped to CT, MA, RI, NH, VT, and ME, and rendered read-only. Transmission owner buckets use the public HIFLD OWNER field when present, then close OpenStreetMap power-line owner/operator tag matches with compatible voltage, then explicit utility owner tokens in public line names; otherwise records remain Unknown public owner. The app does not infer private telecom routes from these lines.",
    notes: "Used only for public reference visualization. Does not imply real OPGW, telecom circuits, SCADA paths, relay/protection channels, or private utility fiber assets.",
    generatedFiles: [
      "frontend/public/data/iso-ne-public-transmission-lines.geojson",
      "frontend/public/data/iso-ne-public-transmission-lines.meta.json",
    ],
  },
  {
    id: "hifld-substations",
    name: "HIFLD Electric Substations",
    category: "Public reference",
    type: "Public reference dataset",
    url: "https://services5.arcgis.com/HDRa0B57OVrv2E1q/ArcGIS/rest/services/Electric_Substations/FeatureServer/0",
    lastReviewed: "2026-06-07",
    role: "Public substation reference points used only when owner/operator can be verified from public source data.",
    handling: "Imported from a public ArcGIS FeatureServer. Unknown-owner records and nearest-line-only inferred owner records are excluded from the displayed substation layer.",
    notes: "Shown as verified public-source owner references only, not as private telecom or operational utility inventory.",
    generatedFiles: [
      "frontend/public/data/iso-ne-public-substations.geojson",
      "frontend/public/data/iso-ne-public-substations.meta.json",
    ],
  },
  {
    id: "openstreetmap-overpass",
    name: "OpenStreetMap via Overpass API",
    category: "Public enrichment",
    type: "Public enrichment dataset",
    url: "https://www.openstreetmap.org/copyright",
    lastReviewed: "2026-06-07",
    role: "Public power=line and power=substation owner/operator tags used for public owner-bucket enrichment.",
    handling: "For transmission lines, only close spatial matches with compatible voltage are used. For substations, only close spatial matches within the configured match tolerance are used. OpenStreetMap data is attributed to OpenStreetMap contributors and is subject to the Open Database License.",
    notes: "Used as public-source enrichment only; it does not establish real internal fiber, protection, SCADA, or telecom topology.",
  },
  {
    id: "fcc-microwave",
    name: "FCC ULS Microwave Public Access Files",
    category: "Public reference",
    type: "Public reference dataset",
    url: "https://data.fcc.gov/download/pub/uls/complete/l_micro.zip",
    lastReviewed: "2026-06-07",
    role: "Public utility-licensee microwave tower/site nodes and point-to-point path references inside the ISO New England map bounds.",
    handling: "Generated from FCC ULS public access tables. The dashboard exposes tower/site nodes and microwave path links as separate read-only public-reference layers. The microwave link layer includes path-frequency grouping from FCC assigned-frequency fields. The app includes only active microwave records whose public licensee name matches a utility-owner pattern and whose public FCC coordinates fall inside CT, MA, RI, NH, VT, or ME. Path links and parameters are FCC public license fields only, including call sign, path number, site/location number, frequency, EIRP, ASR number when present, structure height, and license dates. Records are not operational telecom inventory.",
    notes: "Public communications reference information used for demo visualization only. Does not represent private operational telecom design.",
    generatedFiles: [
      "frontend/public/data/fcc-uls-utility-towers.geojson",
      "frontend/public/data/fcc-uls-utility-microwave-links.geojson",
      "frontend/public/data/fcc-uls-utility-microwave.meta.json",
    ],
  },
  {
    id: "carto-basemap",
    name: "CARTO basemap tiles",
    category: "Basemap",
    type: "Public geographic basemap",
    url: "https://docs.carto.com/faqs/carto-basemaps",
    lastReviewed: "2026-06-07",
    role: "Visual background map tiles for MapLibre.",
    handling: "Used as a basemap only. CARTO/OpenStreetMap attribution remains visible in the map control; planning overlays are stored separately.",
    notes: "Geographic context only; not an engineering or operational source of asset truth.",
  },
  {
    id: "synthetic-gridassetlink-demo",
    name: "Deterministic synthetic generators",
    category: "Synthetic demo",
    type: "Synthetic demo data",
    lastReviewed: "2026-06-07",
    role: "Demo-only transmission structures, OPGW cables, splice closures, fiber strands, splices, patch panels, and assignments.",
    handling: "Generated by local scripts with fixed seeds. These records do not represent real utility assets and must not be used for operations, switching, dispatch, restoration, SCADA, protection, telecom routing, or CEII-restricted analysis.",
    notes: "Non-authoritative synthetic data for software demonstration only.",
    generatedFiles: [
      "frontend/scripts/generate-transmission-structures.ts",
      "frontend/scripts/generate-synthetic-opgw.ts",
      "frontend/scripts/generate-splice-closures.ts",
      "frontend/scripts/generate-fiber-assignments.ts",
    ],
  },
];

export const dataSourceSafetyNotes = [
  "Public transmission lines and public substations are reference layers only.",
  "Transmission structures, OPGW, splices, patch panels, circuits, and fiber assignments are synthetic demo/planning records unless later replaced by user-verified engineering records.",
  "The app does not claim assumed OPGW, private fiber, relay channels, SEL ICON services, SCADA paths, protection paths, leased circuits, or operational telecom routes exist.",
  "Do not enter real CEII, SCADA, relay, protection, telecom, credential, operational-access, or private fiber-route data.",
];
