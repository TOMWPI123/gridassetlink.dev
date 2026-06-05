import type { MapAnnotation } from "@/lib/types/assets";

export const isoNeDiagramAnnotations: MapAnnotation[] = [
  {
    id: "ANN-WBS",
    label: "WBS synthetic planning site",
    entityType: "substation",
    entityId: "SUB-MA-WBS",
    xPercent: 42,
    yPercent: 64,
    status: "existing",
  },
  {
    id: "ANN-AUB",
    label: "AUB timing review",
    entityType: "substation",
    entityId: "SUB-MA-AUB",
    xPercent: 46,
    yPercent: 56,
    status: "existing",
  },
  {
    id: "ANN-BOS",
    label: "Boston hub",
    entityType: "node",
    entityId: "NODE-BOS-OTN",
    xPercent: 64,
    yPercent: 52,
    status: "existing",
  },
  {
    id: "ANN-CMA-143",
    label: "Line 143 assumed OPGW study",
    entityType: "transmission_line",
    entityId: "TL-CMA-143",
    xPercent: 44,
    yPercent: 60,
    status: "planned",
  },
  {
    id: "ANN-PROP-C3794",
    label: "Proposed C37.94 endpoint",
    entityType: "circuit",
    entityId: "NODE-PROPOSED-C3794-A",
    xPercent: 40,
    yPercent: 68,
    status: "proposed",
  },
];
