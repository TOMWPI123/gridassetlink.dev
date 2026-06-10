import type {
  Coordinate,
  DistributionPoleCollection,
  DistributionPoleContinuityRecord,
  DistributionPoleFiberRouteCollection,
  PatchPanel,
  PublicSubstationCollection,
} from "../lib/types/assets";
import {
  createSeededRandom,
  DISTRIBUTION_POLE_CONTINUITY_PATH,
  DISTRIBUTION_POLE_FIBER_PATH,
  DISTRIBUTION_POLES_META_PATH,
  DISTRIBUTION_POLES_PATH,
  distanceMiles,
  idSafe,
  OUTPUT_DIR,
  PATCH_PANELS_PATH,
  readJson,
  round,
  roundCoordinate,
  SYNTHETIC_DISCLAIMER,
  writeJson,
} from "./fiber-network-utils";

const PUBLIC_SUBSTATIONS_PATH = `${OUTPUT_DIR}/iso-ne-public-substations.geojson`;
const TARGET_DISPLAY_POLES = Number(process.env.DISTRIBUTION_POLE_SAMPLE_COUNT || 12000);
const ESTIMATED_REGIONAL_POLE_SCALE = Number(process.env.DISTRIBUTION_POLE_SCALE_COUNT || 1250000);
const SEED = "gridassetlink-distribution-poles-v1";
const NEW_ENGLAND_STATES = new Set(["CT", "ME", "MA", "NH", "RI", "VT"]);

async function main() {
  const rng = createSeededRandom(SEED);
  const publicSubstations = await readJson<PublicSubstationCollection>(PUBLIC_SUBSTATIONS_PATH, { type: "FeatureCollection", features: [] });
  const patchPanels = await readJson<PatchPanel[]>(PATCH_PANELS_PATH, []);
  const candidateSubstations = publicSubstations.features
    .filter((feature) => NEW_ENGLAND_STATES.has(feature.properties.state))
    .filter((feature) => feature.properties.utilityOwner && feature.properties.utilityOwner !== "Unknown public owner")
    .sort((a, b) => `${a.properties.state}-${a.properties.name}`.localeCompare(`${b.properties.state}-${b.properties.name}`));

  const poleFeatures: DistributionPoleCollection["features"] = [];
  const fiberFeatures: DistributionPoleFiberRouteCollection["features"] = [];
  const continuityRecords: DistributionPoleContinuityRecord[] = [];
  const substationsToUse = candidateSubstations;
  const estimatedPerDisplayPole = Math.max(1, Math.round(ESTIMATED_REGIONAL_POLE_SCALE / TARGET_DISPLAY_POLES));

  for (const [substationIndex, substation] of substationsToUse.entries()) {
    if (poleFeatures.length >= TARGET_DISPLAY_POLES) break;
    const remainingSubstations = Math.max(1, substationsToUse.length - substationIndex);
    const remainingBudget = Math.max(0, TARGET_DISPLAY_POLES - poleFeatures.length);
    const targetPolesForSubstation = Math.max(5, Math.floor(remainingBudget / remainingSubstations));
    const feederCount = targetPolesForSubstation > 24 && rng() > 0.45 ? 2 : 1;
    for (let feederIndex = 0; feederIndex < feederCount && poleFeatures.length < TARGET_DISPLAY_POLES; feederIndex += 1) {
      const feeder = buildFeederPath(substation.geometry.coordinates, substationIndex, feederIndex, rng);
      const feederId = `${idSafe(substation.properties.state)}-${idSafe(substation.properties.name || substation.properties.id)}-FD-${String(feederIndex + 1).padStart(2, "0")}`.slice(0, 72);
      const routeId = `DIST-FIBER-${String(fiberFeatures.length + 1).padStart(5, "0")}`;
      const streetPathId = `SYN-STREET-${String(fiberFeatures.length + 1).padStart(5, "0")}`;
      const owner = substation.properties.utilityOwner || "Synthetic utility owner";
      const parentPatchPanel = patchPanels[(substationIndex + feederIndex) % Math.max(1, patchPanels.length)];
      const fiberCount = pickFiberCount(rng);
      const status = pickStatus(rng);
      const serviceTypes = pickServiceTypes(feederIndex, rng);
      const poleStartIndex = poleFeatures.length;
      const polesOnFeeder = Math.max(5, Math.min(poleCountForPath(feeder.coordinates, rng), Math.ceil(targetPolesForSubstation / feederCount)));
      const spacingMiles = Math.max(0.028, totalMiles(feeder.coordinates) / Math.max(1, polesOnFeeder - 1));
      const feederPoleIds: string[] = [];

      for (let sequence = 0; sequence < polesOnFeeder && poleFeatures.length < TARGET_DISPLAY_POLES; sequence += 1) {
        const baseCoordinate = interpolatePath(feeder.coordinates, sequence * spacingMiles);
        const side = sequence % 2 === 0 ? feeder.roadSide : feeder.roadSide === "left" ? "right" : "left";
        const coordinate = offsetToRoadEdge(baseCoordinate, feeder.bearingDegrees, side);
        const id = `DIST-POLE-${String(poleFeatures.length + 1).padStart(7, "0")}`;
        const poleNumber = `${feederId}-P${String(sequence + 1).padStart(5, "0")}`;
        feederPoleIds.push(id);
        poleFeatures.push({
          type: "Feature",
          properties: {
            id,
            poleNumber,
            feederId,
            streetPathId,
            sequenceIndex: sequence + 1,
            latitude: coordinate[1],
            longitude: coordinate[0],
            utilityOwner: owner,
            state: normalizeState(substation.properties.state),
            placementModel: "synthetic_street_path",
            placementBasis: "Synthetic street-following telecom pole placement generated from public substation reference nodes. Not real pole inventory.",
            roadSide: side,
            poleClass: rng() > 0.94 ? "composite" : "distribution_wood",
            heightFt: pickHeight(rng),
            spanFromPreviousFt: sequence === 0 ? undefined : Math.round(spacingMiles * 5280),
            telecomRole: sequence === 0 ? "riser" : sequence % 18 === 0 ? "splice_pole" : sequence % 9 === 0 ? "fiber_lateral" : "distribution_backbone",
            hasTelecomFiber: true,
            fiberCount,
            connectedDistributionFiberRouteIds: [routeId],
            upstreamPoleId: sequence > 0 ? `DIST-POLE-${String(poleFeatures.length).padStart(7, "0")}` : undefined,
            downstreamPoleId: undefined,
            upstreamNetworkNodeId: substation.properties.id,
            upstreamPatchPanelId: parentPatchPanel?.id,
            continuityPathId: `DIST-CONT-${routeId}`,
            serviceDropCount: sequence % 3 === 0 ? Math.floor(rng() * 8) : Math.floor(rng() * 3),
            status,
            synthetic: true,
            source: "synthetic-demo",
            notes: SYNTHETIC_DISCLAIMER,
          },
          geometry: { type: "Point", coordinates: coordinate },
        });
      }

      for (let index = poleStartIndex; index < poleFeatures.length - 1; index += 1) {
        poleFeatures[index].properties.downstreamPoleId = poleFeatures[index + 1].properties.id;
      }
      if (!feederPoleIds.length) continue;

      fiberFeatures.push({
        type: "Feature",
        properties: {
          routeId,
          routeName: `${feederId} synthetic telecom fiber`,
          feederId,
          streetPathId,
          utilityOwner: owner,
          state: normalizeState(substation.properties.state),
          synthetic: true,
          source: "synthetic-demo",
          placementModel: "synthetic_street_path",
          routeMiles: round(totalMiles(feeder.coordinates), 3),
          poleCount: feederPoleIds.length,
          firstPoleId: feederPoleIds[0],
          lastPoleId: feederPoleIds[feederPoleIds.length - 1],
          samplePoleIds: sampleIds(feederPoleIds),
          parentPatchPanelId: parentPatchPanel?.id,
          parentOpgwRouteId: parentPatchPanel?.fiberCableIds?.[0] ? `OPGW-${parentPatchPanel.fiberCableIds[0]}` : undefined,
          fiberCount,
          status,
          continuityStatus: status === "proposed" ? "proposed" : status === "planned" ? "planned" : "complete_synthetic",
          serviceTypesCarried: serviceTypes,
          estimatedPoleScaleCount: feederPoleIds.length * estimatedPerDisplayPole,
          notes: "Synthetic distribution telecom feeder route following generated street paths. Not a real utility pole or fiber route.",
        },
        geometry: { type: "LineString", coordinates: feeder.coordinates.map(roundCoordinate) },
      });

      continuityRecords.push({
        continuityId: `DIST-CONT-${routeId}`,
        routeId,
        feederId,
        utilityOwner: owner,
        state: substation.properties.state,
        endpointAType: parentPatchPanel ? "substation_patch_panel" : "synthetic_telecom_node",
        endpointAId: parentPatchPanel?.id || substation.properties.id,
        endpointZType: "distribution_pole",
        endpointZId: feederPoleIds[feederPoleIds.length - 1],
        totalPoleCount: feederPoleIds.length,
        samplePoleIds: sampleIds(feederPoleIds),
        fiberCount,
        serviceTypesCarried: serviceTypes,
        continuityStatus: status === "proposed" ? "proposed" : status === "planned" ? "planned" : "complete_synthetic",
        synthetic: true,
        warning: "Synthetic distribution continuity only. Do not use for operations, dispatch, restoration, SCADA, protection, or CEII analysis.",
      });
    }
  }

  await writeJson(DISTRIBUTION_POLES_PATH, { type: "FeatureCollection", features: poleFeatures });
  await writeJson(DISTRIBUTION_POLE_FIBER_PATH, { type: "FeatureCollection", features: fiberFeatures });
  await writeJson(DISTRIBUTION_POLE_CONTINUITY_PATH, continuityRecords);
  await writeJson(DISTRIBUTION_POLES_META_PATH, {
    generatedAt: new Date().toISOString(),
    seed: SEED,
    source: "synthetic-demo",
    publicReferenceInput: "iso-ne-public-substations.geojson",
    displayPoleCount: poleFeatures.length,
    fiberRouteCount: fiberFeatures.length,
    continuityRecordCount: continuityRecords.length,
    estimatedRegionalPoleScale: ESTIMATED_REGIONAL_POLE_SCALE,
    estimatedPolesRepresentedPerDisplayPole: estimatedPerDisplayPole,
    coveredStates: [...new Set(poleFeatures.map((feature) => feature.properties.state))].sort(),
    coveredPublicSubstationAnchors: substationsToUse.length,
    optimizationNote: "Dashboard renders a bounded synthetic display sample with MapLibre clustering and zoom gating. Million-pole exports should be generated offline and served as vector tiles or partitioned GeoJSON.",
    disclaimer: "Distribution poles, street paths, telecom fiber routes, and continuity records are synthetic demo/planning records. They do not represent real utility poles or private telecom routes.",
  });

  console.log(`Generated ${poleFeatures.length} synthetic distribution telecom poles on ${fiberFeatures.length} feeder routes.`);
}

function buildFeederPath(origin: Coordinate, substationIndex: number, feederIndex: number, rng: () => number) {
  const primaryBearing = ((substationIndex * 29 + feederIndex * 61) % 360) + (rng() - 0.5) * 24;
  const roadSide = rng() > 0.5 ? "left" as const : "right" as const;
  const segmentCount = 3 + Math.floor(rng() * 3);
  const coordinates: Coordinate[] = [roundCoordinate(origin)];
  let current = origin;
  let bearing = primaryBearing;
  for (let index = 0; index < segmentCount; index += 1) {
    const segmentMiles = 0.55 + rng() * 1.35;
    current = moveCoordinate(current, bearing, segmentMiles);
    coordinates.push(roundCoordinate(current));
    bearing += (rng() > 0.5 ? 90 : -90) + (rng() - 0.5) * 18;
  }
  return { coordinates, bearingDegrees: primaryBearing, roadSide };
}

function moveCoordinate(origin: Coordinate, bearingDegrees: number, miles: number): Coordinate {
  const radians = bearingDegrees * Math.PI / 180;
  const deltaLat = Math.cos(radians) * miles / 69;
  const deltaLon = Math.sin(radians) * miles / (Math.cos(origin[1] * Math.PI / 180) * 69.172);
  return [origin[0] + deltaLon, origin[1] + deltaLat];
}

function offsetToRoadEdge(coordinate: Coordinate, bearingDegrees: number, roadSide: "left" | "right") {
  const offsetBearing = bearingDegrees + (roadSide === "left" ? -90 : 90);
  return roundCoordinate(moveCoordinate(coordinate, offsetBearing, 0.004));
}

function totalMiles(coordinates: Coordinate[]) {
  let miles = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) miles += distanceMiles(coordinates[index], coordinates[index + 1]);
  return miles;
}

function interpolatePath(coordinates: Coordinate[], targetMiles: number): Coordinate {
  if (coordinates.length <= 1) return coordinates[0] || [0, 0];
  let walked = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    const segmentMiles = distanceMiles(start, end);
    if (walked + segmentMiles >= targetMiles) {
      const amount = segmentMiles === 0 ? 0 : (targetMiles - walked) / segmentMiles;
      return [start[0] + (end[0] - start[0]) * amount, start[1] + (end[1] - start[1]) * amount];
    }
    walked += segmentMiles;
  }
  return coordinates[coordinates.length - 1];
}

function poleCountForPath(coordinates: Coordinate[], rng: () => number) {
  const miles = totalMiles(coordinates);
  const averageSpanMiles = (135 + rng() * 65) / 5280;
  return Math.max(8, Math.min(160, Math.round(miles / averageSpanMiles)));
}

function pickFiberCount(rng: () => number) {
  const roll = rng();
  if (roll > 0.92) return 96 as const;
  if (roll > 0.72) return 48 as const;
  if (roll > 0.42) return 24 as const;
  return 12 as const;
}

function pickHeight(rng: () => number) {
  const heights = [35, 40, 45, 50, 55, 60] as const;
  return heights[Math.floor(rng() * heights.length)];
}

function pickStatus(rng: () => number) {
  const roll = rng();
  if (roll > 0.9) return "proposed" as const;
  if (roll > 0.75) return "planned" as const;
  if (roll > 0.68) return "needs_field_verification" as const;
  return "in_service_synthetic" as const;
}

function pickServiceTypes(index: number, rng: () => number): DistributionPoleContinuityRecord["serviceTypesCarried"] {
  const services: DistributionPoleContinuityRecord["serviceTypesCarried"] = ["Telecom Backhaul"];
  if (index % 2 === 0) services.push("Distribution Automation");
  if (rng() > 0.45) services.push("SCADA");
  if (rng() > 0.72) services.push("AMI Backhaul");
  if (rng() > 0.86) services.push("Protection Pilot");
  if (rng() > 0.8) services.push("Spare");
  return [...new Set(services)];
}

function sampleIds(ids: string[]) {
  if (ids.length <= 10) return ids;
  return [ids[0], ids[1], ids[2], ids[Math.floor(ids.length / 2)], ids[ids.length - 3], ids[ids.length - 2], ids[ids.length - 1]];
}

function normalizeState(value: string) {
  return NEW_ENGLAND_STATES.has(value) ? value as "CT" | "ME" | "MA" | "NH" | "RI" | "VT" : "unknown";
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
