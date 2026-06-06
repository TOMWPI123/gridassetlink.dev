import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createRequire } from "node:module";
import type { Coordinate, FccMicrowaveLinkCollection, FccMicrowaveLinkFeature, FccUtilityTowerCollection, FccUtilityTowerFeature, IsoNeState } from "../lib/types/assets";
import { ISO_NE_STATES, isInIsoNeBounds, statesForCoordinates } from "./clip-to-iso-ne";

const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip") as new (filePath: string) => {
  getEntry(name: string): unknown;
  extractEntryTo(entry: unknown, targetPath: string, maintainEntryPath: boolean, overwrite: boolean): void;
};

const FCC_MICROWAVE_ZIP_URL = "https://data.fcc.gov/download/pub/uls/complete/l_micro.zip";
const PUBLIC_NOTICE = "Public FCC ULS microwave records only. Utility-owned/licensee records inside ISO New England bounds. Not for operations.";
const OUTPUT_DIR = path.join(process.cwd(), "public", "data");
const OUTPUT_TOWERS = path.join(OUTPUT_DIR, "fcc-uls-utility-towers.geojson");
const OUTPUT_LINKS = path.join(OUTPUT_DIR, "fcc-uls-utility-microwave-links.geojson");
const OUTPUT_META = path.join(OUTPUT_DIR, "fcc-uls-utility-microwave.meta.json");
const CACHE_DIR = process.env.FCC_ULS_CACHE_DIR || path.join(os.tmpdir(), "gridassetlink-fcc-uls");
const ZIP_PATH = process.env.FCC_ULS_MICROWAVE_ZIP || path.join(CACHE_DIR, "l_micro.zip");
const DOWNLOAD_TIMEOUT_MS = Number(process.env.FCC_DOWNLOAD_TIMEOUT_MS || 420000);

type License = {
  uniqueId: string;
  callSign: string;
  radioServiceCode: string;
  licenseStatus: "active" | "unknown";
  grantDate: string;
  expirationDate: string;
};

type UtilityLicense = License & {
  utilityOwner: string;
  rawLicenseeName: string;
  frn: string;
  typeOfOperation: string;
  stationClass: string;
};

type LocationRecord = {
  id: string;
  uniqueId: string;
  callSign: string;
  locationNumber: number;
  locationTypeCode: string;
  locationClassCode: string;
  address: string;
  city: string;
  county: string;
  state: IsoNeState;
  coordinate: Coordinate;
  towerRegistrationNumber: string;
  groundElevationM: number | null;
  supportHeightM: number | null;
  overallHeightM: number | null;
  structureType: string;
  locationName: string;
  linkedPathIds: Set<string>;
  frequencyBandsMhz: Set<number>;
};

type PathRecord = {
  uniqueId: string;
  callSign: string;
  pathNumber: number;
  txLocationNumber: number;
  txAntennaNumber: number;
  rxLocationNumber: number;
  rxAntennaNumber: number;
  pathTypeDesc: string;
  receiverCallSign: string;
  pathStatus: string;
  linkStartDate: string;
  linkEndDate: string;
};

type FrequencyRecord = {
  frequencyAssignedMhz: number | null;
  frequencyUpperBandMhz: number | null;
  eirp: number | null;
  powerOutput: number | null;
  transmitterMake: string;
  transmitterModel: string;
};

type IngestMeta = {
  sourceName: string;
  sourceType: "public-reference";
  sourceUrl: string;
  generatedAt: string;
  statesIncluded: typeof ISO_NE_STATES;
  utilityLicenseCount: number;
  utilityTowerCount: number;
  utilityMicrowaveLinkCount: number;
  ownerSummary: Record<string, number>;
  frequencySummary: Record<string, number>;
  notes: string;
};

const utilityOwnerPatterns: Array<{ pattern: RegExp; owner: string }> = [
  { pattern: /\bEVERSOURCE\b|\bNSTAR\b|\bCONNECTICUT LIGHT\s*&?\s*POWER\b|\bPUBLIC SERVICE (?:CO|COMPANY) OF (?:NEW HAMPSHIRE|NH)\b|\bWESTERN MASS(?:ACHUSETTS)? ELECTRIC\b|\bWMECO\b/i, owner: "Eversource Energy" },
  { pattern: /\bNATIONAL GRID\b|\bNEW ENGLAND POWER\b|\bMASSACHUSETTS ELECTRIC\b|\bNARRAGANSETT ELECTRIC\b|\bNIAGARA MOHAWK\b/i, owner: "National Grid" },
  { pattern: /\bCENTRAL MAINE POWER\b|\bCMP\b/i, owner: "Central Maine Power" },
  { pattern: /\bVERMONT ELECTRIC POWER\b|\bVELCO\b/i, owner: "Vermont Electric Power Company" },
  { pattern: /\bGREEN MOUNTAIN POWER\b|\bGMP\b/i, owner: "Green Mountain Power" },
  { pattern: /\bUNITED ILLUMINATING\b|\bTHE UNITED ILLUMINATING\b|\bUIL HOLDINGS\b/i, owner: "United Illuminating Company" },
  { pattern: /\bAVANGRID\b/i, owner: "Avangrid" },
  { pattern: /\bRHODE ISLAND ENERGY\b|\bPPL ELECTRIC\b/i, owner: "Rhode Island Energy" },
  { pattern: /\bVERSANT POWER\b|\bBANGOR HYDRO\b|\bMAINE PUBLIC SERVICE\b/i, owner: "Versant Power" },
  { pattern: /\bUNITIL\b|\bFITCHBURG GAS\b|\bCONCORD ELECTRIC\b|\bEXETER\s*&?\s*HAMPTON ELECTRIC\b/i, owner: "Unitil" },
  { pattern: /\bNEW YORK POWER AUTHORITY\b/i, owner: "New York Power Authority" },
  { pattern: /\bNEW YORK STATE ELECTRIC\s*&?\s*GAS\b|\bNYSEG\b/i, owner: "New York State Electric & Gas" },
  { pattern: /\bCONSOLIDATED EDISON\b|\bCON EDISON\b/i, owner: "Consolidated Edison" },
  { pattern: /\bNB POWER\b|\bNEW BRUNSWICK POWER\b/i, owner: "NB Power" },
  { pattern: /\bMUNICIPAL (?:LIGHT|ELECTRIC|UTILITIES|POWER)\b|\bLIGHT DEPARTMENT\b|\bELECTRIC LIGHT (?:DEPARTMENT|COMPANY)\b/i, owner: "Municipal utility" },
];

const nonUtilityOwnerPatterns = /\b(AMERICAN TOWER|CROWN CASTLE|SBA|CELLCO|VERIZON|AT&T|T-MOBILE|SPRINT|DISH|COMCAST|CHARTER|SPECTRUM|BROADCAST|TELEVISION|RADIO|COUNTY OF|STATE OF|POLICE|FIRE|EMERGENCY|UNIVERSITY|HOSPITAL)\b/i;

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  ensureCacheDir();
  await ensureZip();
  extractEntries(["HD.dat", "EN.dat", "MW.dat", "LO.dat", "PA.dat", "FR.dat"]);

  const activeLicenses = await readActiveLicenses();
  const utilityLicenses = await readUtilityLicenses(activeLicenses);
  await readMicrowaveLicenseDetails(utilityLicenses);
  const locations = await readUtilityLocations(utilityLicenses);
  const pathRecords = await readUtilityPaths(utilityLicenses, locations);
  const frequencyRecords = await readFrequencyRecords(pathRecords);
  const { towers, links } = buildFeatures(utilityLicenses, locations, pathRecords, frequencyRecords);

  await writeOutputs(
    { type: "FeatureCollection", features: towers },
    { type: "FeatureCollection", features: links },
    {
      sourceName: "FCC ULS Microwave Public Access Files",
      sourceType: "public-reference",
      sourceUrl: FCC_MICROWAVE_ZIP_URL,
      generatedAt: new Date().toISOString(),
      statesIncluded: ISO_NE_STATES,
      utilityLicenseCount: utilityLicenses.size,
      utilityTowerCount: towers.length,
      utilityMicrowaveLinkCount: links.length,
      ownerSummary: summarizeOwners(towers, links),
      frequencySummary: summarizeFrequencyBands(links),
      notes: PUBLIC_NOTICE,
    },
  );
}

async function ensureZip() {
  if (existsSync(ZIP_PATH)) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(FCC_MICROWAVE_ZIP_URL, {
      headers: { "User-Agent": "GridAssetLink FCC public ULS utility layer generator" },
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error(`FCC download failed: ${response.status} ${response.statusText}`);
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(ZIP_PATH));
  } finally {
    clearTimeout(timeout);
  }
}

function extractEntries(entryNames: string[]) {
  const zip = new AdmZip(ZIP_PATH);
  entryNames.forEach((entryName) => {
    const outputPath = path.join(CACHE_DIR, entryName);
    if (existsSync(outputPath)) return;
    const entry = zip.getEntry(entryName);
    if (!entry) throw new Error(`Missing FCC ULS entry ${entryName}`);
    zip.extractEntryTo(entry, CACHE_DIR, false, true);
  });
}

async function readActiveLicenses() {
  const licenses = new Map<string, License>();
  await forEachDatLine("HD.dat", (fields) => {
    if (fields[5] !== "A") return;
    const uniqueId = fields[1];
    licenses.set(uniqueId, {
      uniqueId,
      callSign: clean(fields[4]),
      radioServiceCode: clean(fields[6]),
      licenseStatus: "active",
      grantDate: clean(fields[7]),
      expirationDate: clean(fields[8]),
    });
  });
  return licenses;
}

async function readUtilityLicenses(activeLicenses: Map<string, License>) {
  const utilityLicenses = new Map<string, UtilityLicense>();
  await forEachDatLine("EN.dat", (fields) => {
    const uniqueId = fields[1];
    const license = activeLicenses.get(uniqueId);
    if (!license || fields[5] !== "L") return;
    const rawLicenseeName = clean(fields[7]);
    const utilityOwner = publicUtilityOwner(rawLicenseeName);
    if (!utilityOwner) return;
    utilityLicenses.set(uniqueId, {
      ...license,
      utilityOwner,
      rawLicenseeName,
      frn: clean(fields[22]),
      typeOfOperation: "",
      stationClass: "",
    });
  });
  return utilityLicenses;
}

async function readMicrowaveLicenseDetails(utilityLicenses: Map<string, UtilityLicense>) {
  await forEachDatLine("MW.dat", (fields) => {
    const license = utilityLicenses.get(fields[1]);
    if (!license) return;
    license.typeOfOperation = clean(fields[8]);
    license.stationClass = clean(fields[10]);
  });
}

async function readUtilityLocations(utilityLicenses: Map<string, UtilityLicense>) {
  const locations = new Map<string, LocationRecord>();
  await forEachDatLine("LO.dat", (fields) => {
    const uniqueId = fields[1];
    if (!utilityLicenses.has(uniqueId)) return;
    const coordinate = dmsCoordinate(fields[19], fields[20], fields[21], fields[22], fields[23], fields[24], fields[25], fields[26]);
    if (!coordinate || !isInIsoNeBounds(coordinate)) return;
    const rawState = clean(fields[14]).toUpperCase();
    const state = isIsoNeState(rawState) ? rawState : statesForCoordinates([coordinate])[0];
    if (!state) return;
    const locationNumber = parseInteger(fields[8]);
    if (!locationNumber) return;
    const id = nodeId(utilityLicenses.get(uniqueId)!.callSign, locationNumber);
    locations.set(`${uniqueId}|${locationNumber}`, {
      id,
      uniqueId,
      callSign: clean(fields[4]),
      locationNumber,
      locationTypeCode: clean(fields[6]),
      locationClassCode: clean(fields[7]),
      address: clean(fields[11]),
      city: clean(fields[12]),
      county: clean(fields[13]),
      state,
      coordinate,
      towerRegistrationNumber: clean(fields[37]),
      groundElevationM: parseNumber(fields[18]),
      supportHeightM: parseNumber(fields[38]),
      overallHeightM: parseNumber(fields[39]),
      structureType: clean(fields[40]),
      locationName: clean(fields[42]),
      linkedPathIds: new Set<string>(),
      frequencyBandsMhz: new Set<number>(),
    });
  });
  return locations;
}

async function readUtilityPaths(utilityLicenses: Map<string, UtilityLicense>, locations: Map<string, LocationRecord>) {
  const pathRecords: PathRecord[] = [];
  await forEachDatLine("PA.dat", (fields) => {
    const uniqueId = fields[1];
    if (!utilityLicenses.has(uniqueId)) return;
    const pathNumber = parseInteger(fields[6]);
    const txLocationNumber = parseInteger(fields[7]);
    const txAntennaNumber = parseInteger(fields[8]);
    const rxLocationNumber = parseInteger(fields[9]);
    const rxAntennaNumber = parseInteger(fields[10]);
    if (!pathNumber || !txLocationNumber || !rxLocationNumber) return;
    if (!locations.has(`${uniqueId}|${txLocationNumber}`) || !locations.has(`${uniqueId}|${rxLocationNumber}`)) return;
    pathRecords.push({
      uniqueId,
      callSign: clean(fields[4]),
      pathNumber,
      txLocationNumber,
      txAntennaNumber: txAntennaNumber || 0,
      rxLocationNumber,
      rxAntennaNumber: rxAntennaNumber || 0,
      pathTypeDesc: clean(fields[12]),
      receiverCallSign: clean(fields[16]),
      pathStatus: clean(fields[20]),
      linkStartDate: clean(fields[22]),
      linkEndDate: clean(fields[23]),
    });
  });
  return pathRecords;
}

async function readFrequencyRecords(pathRecords: PathRecord[]) {
  const targetKeys = new Set(pathRecords.map((record) => frequencyKey(record.uniqueId, record.txLocationNumber, record.txAntennaNumber)));
  const frequencies = new Map<string, FrequencyRecord>();
  await forEachDatLine("FR.dat", (fields) => {
    const key = frequencyKey(fields[1], parseInteger(fields[6]), parseInteger(fields[7]));
    if (!targetKeys.has(key) || frequencies.has(key)) return;
    frequencies.set(key, {
      frequencyAssignedMhz: parseNumber(fields[10]),
      frequencyUpperBandMhz: parseNumber(fields[11]),
      eirp: parseNumber(fields[20]),
      powerOutput: parseNumber(fields[15]),
      transmitterMake: clean(fields[21]),
      transmitterModel: clean(fields[22]),
    });
  });
  return frequencies;
}

function buildFeatures(
  utilityLicenses: Map<string, UtilityLicense>,
  locations: Map<string, LocationRecord>,
  pathRecords: PathRecord[],
  frequencyRecords: Map<string, FrequencyRecord>,
) {
  const towersById = new Map<string, FccUtilityTowerFeature>();
  const links: FccMicrowaveLinkFeature[] = [];

  pathRecords.forEach((pathRecord) => {
    const license = utilityLicenses.get(pathRecord.uniqueId);
    const tx = locations.get(`${pathRecord.uniqueId}|${pathRecord.txLocationNumber}`);
    const rx = locations.get(`${pathRecord.uniqueId}|${pathRecord.rxLocationNumber}`);
    if (!license || !tx || !rx) return;
    const pathDistanceMiles = Number(haversineMiles(tx.coordinate, rx.coordinate).toFixed(2));
    if (pathDistanceMiles < 0.05) return;
    const pathId = `FCC-MW-${license.callSign}-P${pathRecord.pathNumber}`;
    const frequency = frequencyRecords.get(frequencyKey(pathRecord.uniqueId, pathRecord.txLocationNumber, pathRecord.txAntennaNumber));
    [tx, rx].forEach((location) => {
      location.linkedPathIds.add(pathId);
      if (frequency?.frequencyAssignedMhz) location.frequencyBandsMhz.add(frequency.frequencyAssignedMhz);
    });
    links.push({
      type: "Feature",
      properties: {
        id: pathId,
        linkName: `${license.utilityOwner} ${license.callSign} path ${pathRecord.pathNumber}`,
        callSign: license.callSign,
        utilityOwner: license.utilityOwner,
        rawLicenseeName: license.rawLicenseeName,
        radioServiceCode: license.radioServiceCode || null,
        typeOfOperation: license.typeOfOperation || null,
        stationClass: license.stationClass || null,
        pathNumber: pathRecord.pathNumber,
        pathTypeDesc: pathRecord.pathTypeDesc || null,
        txNodeId: tx.id,
        rxNodeId: rx.id,
        txLocationNumber: tx.locationNumber,
        rxLocationNumber: rx.locationNumber,
        txAntennaNumber: pathRecord.txAntennaNumber || null,
        rxAntennaNumber: pathRecord.rxAntennaNumber || null,
        receiverCallSign: pathRecord.receiverCallSign || null,
        frequencyAssignedMhz: frequency?.frequencyAssignedMhz ?? null,
        frequencyUpperBandMhz: frequency?.frequencyUpperBandMhz ?? null,
        eirp: frequency?.eirp ?? null,
        powerOutput: frequency?.powerOutput ?? null,
        transmitterMake: frequency?.transmitterMake || null,
        transmitterModel: frequency?.transmitterModel || null,
        pathDistanceMiles,
        pathStatus: pathRecord.pathStatus || null,
        linkStartDate: pathRecord.linkStartDate || null,
        linkEndDate: pathRecord.linkEndDate || null,
        states: [...new Set([tx.state, rx.state])],
        source: "FCC ULS",
        sourceType: "public-reference",
        readOnly: true,
        synthetic: false,
        isoNe: true,
        publicDataNotice: "Public FCC ULS microwave path record. Utility telecom planning reference only; not for operations.",
      },
      geometry: { type: "LineString", coordinates: [tx.coordinate, rx.coordinate] },
    });
  });

  locations.forEach((location) => {
    const license = utilityLicenses.get(location.uniqueId);
    if (!license) return;
    towersById.set(location.id, {
      type: "Feature",
      properties: {
        id: location.id,
        nodeName: `${license.utilityOwner} ${license.callSign} loc ${location.locationNumber}`,
        callSign: license.callSign,
        utilityOwner: license.utilityOwner,
        rawLicenseeName: license.rawLicenseeName,
        frn: license.frn || null,
        radioServiceCode: license.radioServiceCode || null,
        licenseStatus: license.licenseStatus,
        grantDate: license.grantDate || null,
        expirationDate: license.expirationDate || null,
        locationNumber: location.locationNumber,
        locationName: location.locationName || null,
        locationTypeCode: location.locationTypeCode || null,
        locationClassCode: location.locationClassCode || null,
        address: location.address || null,
        city: location.city || null,
        county: location.county || null,
        state: location.state,
        towerRegistrationNumber: location.towerRegistrationNumber || null,
        groundElevationM: location.groundElevationM,
        supportHeightM: location.supportHeightM,
        overallHeightM: location.overallHeightM,
        structureType: location.structureType || null,
        linkedPathIds: [...location.linkedPathIds].sort(),
        frequencyBandsMhz: [...location.frequencyBandsMhz].sort((a, b) => a - b),
        source: "FCC ULS",
        sourceType: "public-reference",
        readOnly: true,
        synthetic: false,
        isoNe: true,
        publicDataNotice: "Public FCC ULS microwave site record. Utility telecom planning reference only; not for operations.",
      },
      geometry: { type: "Point", coordinates: location.coordinate },
    });
  });

  return {
    towers: [...towersById.values()].sort((a, b) => a.properties.utilityOwner.localeCompare(b.properties.utilityOwner) || a.properties.callSign.localeCompare(b.properties.callSign)),
    links: links.sort((a, b) => a.properties.utilityOwner.localeCompare(b.properties.utilityOwner) || a.properties.id.localeCompare(b.properties.id)),
  };
}

async function writeOutputs(towers: FccUtilityTowerCollection, links: FccMicrowaveLinkCollection, metadata: IngestMeta) {
  await writeFile(OUTPUT_TOWERS, `${JSON.stringify(towers, null, 2)}\n`, "utf-8");
  await writeFile(OUTPUT_LINKS, `${JSON.stringify(links, null, 2)}\n`, "utf-8");
  await writeFile(OUTPUT_META, `${JSON.stringify(metadata, null, 2)}\n`, "utf-8");
  console.log(`Wrote ${towers.features.length} FCC utility tower nodes and ${links.features.length} microwave links.`);
}

async function forEachDatLine(fileName: string, handler: (fields: string[]) => void) {
  const filePath = path.join(CACHE_DIR, fileName);
  const reader = readline.createInterface({ input: createReadStream(filePath, { encoding: "utf-8" }), crlfDelay: Infinity });
  for await (const line of reader) {
    if (!line) continue;
    handler(line.split("|"));
  }
}

function publicUtilityOwner(value: string) {
  if (!value || nonUtilityOwnerPatterns.test(value)) return "";
  return utilityOwnerPatterns.find(({ pattern }) => pattern.test(value))?.owner || "";
}

function dmsCoordinate(latDegrees: string, latMinutes: string, latSeconds: string, latDirection: string, lonDegrees: string, lonMinutes: string, lonSeconds: string, lonDirection: string): Coordinate | null {
  const latitude = dmsToDecimal(latDegrees, latMinutes, latSeconds, latDirection);
  const longitude = dmsToDecimal(lonDegrees, lonMinutes, lonSeconds, lonDirection);
  if (latitude === null || longitude === null) return null;
  return [roundCoord(longitude), roundCoord(latitude)];
}

function dmsToDecimal(degreesText: string, minutesText: string, secondsText: string, direction: string) {
  const degrees = parseNumber(degreesText);
  const minutes = parseNumber(minutesText) || 0;
  const seconds = parseNumber(secondsText) || 0;
  if (degrees === null) return null;
  const sign = /[SW]/i.test(direction) ? -1 : 1;
  return sign * (Math.abs(degrees) + minutes / 60 + seconds / 3600);
}

function nodeId(callSign: string, locationNumber: number) {
  return `FCC-ULS-${safeId(callSign)}-LOC-${locationNumber}`;
}

function frequencyKey(uniqueId: string, locationNumber: number, antennaNumber: number) {
  return `${uniqueId}|${locationNumber || 0}|${antennaNumber || 0}`;
}

function safeId(value: string) {
  return clean(value).replace(/[^A-Z0-9]+/gi, "-").replace(/^-|-$/g, "").toUpperCase() || "UNKNOWN";
}

function summarizeOwners(towers: FccUtilityTowerFeature[], links: FccMicrowaveLinkFeature[]) {
  const counts: Record<string, number> = {};
  towers.forEach((tower) => {
    counts[tower.properties.utilityOwner] = (counts[tower.properties.utilityOwner] || 0) + 1;
  });
  links.forEach((link) => {
    counts[`${link.properties.utilityOwner} links`] = (counts[`${link.properties.utilityOwner} links`] || 0) + 1;
  });
  return sortRecord(counts);
}

function summarizeFrequencyBands(links: FccMicrowaveLinkFeature[]) {
  const counts: Record<string, number> = {};
  links.forEach((link) => {
    const band = frequencyBandLabel(link.properties.frequencyAssignedMhz);
    counts[band] = (counts[band] || 0) + 1;
  });
  return sortRecord(counts);
}

function frequencyBandLabel(frequencyMhz?: number | null) {
  if (!frequencyMhz) return "unknown";
  if (frequencyMhz >= 21000) return "23 GHz+";
  if (frequencyMhz >= 17000) return "18 GHz";
  if (frequencyMhz >= 10000) return "11-15 GHz";
  if (frequencyMhz >= 5800) return "6-7 GHz";
  if (frequencyMhz >= 1900) return "2 GHz";
  return "below 2 GHz";
}

function haversineMiles([lon1, lat1]: Coordinate, [lon2, lat2]: Coordinate) {
  const radiusMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sortRecord(record: Record<string, number>) {
  return Object.fromEntries(Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function parseInteger(value: string) {
  const parsed = Number.parseInt(clean(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseNumber(value: string) {
  const cleaned = clean(value);
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function clean(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function isIsoNeState(value: string): value is IsoNeState {
  return (ISO_NE_STATES as readonly string[]).includes(value);
}

function roundCoord(value: number) {
  return Number(value.toFixed(6));
}

function toRad(value: number) {
  return value * Math.PI / 180;
}

function ensureCacheDir() {
  mkdirSync(CACHE_DIR, { recursive: true });
}

void main();
