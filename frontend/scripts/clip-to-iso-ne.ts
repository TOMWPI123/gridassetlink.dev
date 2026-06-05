import type { Coordinate, IsoNeState } from "../lib/types/assets";

export const ISO_NE_STATES: IsoNeState[] = ["CT", "MA", "RI", "NH", "VT", "ME"];
export const ISO_NE_BOUNDS = {
  west: -74.2,
  south: 40.8,
  east: -66.7,
  north: 47.7,
};

export const STATE_BOUNDS: Record<IsoNeState, { west: number; south: number; east: number; north: number }> = {
  MA: { west: -73.6, south: 41.2, east: -69.8, north: 42.9 },
  CT: { west: -73.8, south: 40.9, east: -71.7, north: 42.1 },
  RI: { west: -71.9, south: 41.1, east: -71.1, north: 42.0 },
  NH: { west: -72.6, south: 42.7, east: -70.6, north: 45.4 },
  VT: { west: -73.5, south: 42.7, east: -71.4, north: 45.1 },
  ME: { west: -71.1, south: 43.0, east: -66.9, north: 47.5 },
};

const INSIDE = 0;
const LEFT = 1;
const RIGHT = 2;
const BOTTOM = 4;
const TOP = 8;

export function isInIsoNeBounds([longitude, latitude]: Coordinate) {
  return longitude >= ISO_NE_BOUNDS.west && longitude <= ISO_NE_BOUNDS.east && latitude >= ISO_NE_BOUNDS.south && latitude <= ISO_NE_BOUNDS.north;
}

export function statesForCoordinates(coordinates: Coordinate[]): IsoNeState[] {
  const states = new Set<IsoNeState>();
  coordinates.forEach((coordinate) => {
    ISO_NE_STATES.forEach((state) => {
      if (isInBounds(coordinate, STATE_BOUNDS[state])) states.add(state);
    });
  });
  return [...states];
}

export function clipLineStringToIsoNe(coordinates: Coordinate[]): Coordinate[] {
  const clipped: Coordinate[] = [];
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const segment = clipSegmentToBounds(coordinates[index], coordinates[index + 1]);
    if (!segment) continue;
    const [start, end] = segment;
    if (!clipped.length || !sameCoordinate(clipped[clipped.length - 1], start)) clipped.push(roundCoordinate(start));
    clipped.push(roundCoordinate(end));
  }
  return dedupeAdjacent(clipped);
}

export function flattenLineCoordinates(geometry: { type: string; coordinates: unknown }): Coordinate[] {
  if (geometry.type === "LineString") return (geometry.coordinates as Coordinate[]).filter(isCoordinatePair);
  if (geometry.type === "MultiLineString") return (geometry.coordinates as Coordinate[][]).flat().filter(isCoordinatePair);
  return [];
}

function isInBounds([longitude, latitude]: Coordinate, bounds: { west: number; south: number; east: number; north: number }) {
  return longitude >= bounds.west && longitude <= bounds.east && latitude >= bounds.south && latitude <= bounds.north;
}

function outCode([longitude, latitude]: Coordinate) {
  let code = INSIDE;
  if (longitude < ISO_NE_BOUNDS.west) code |= LEFT;
  else if (longitude > ISO_NE_BOUNDS.east) code |= RIGHT;
  if (latitude < ISO_NE_BOUNDS.south) code |= BOTTOM;
  else if (latitude > ISO_NE_BOUNDS.north) code |= TOP;
  return code;
}

function clipSegmentToBounds(start: Coordinate, end: Coordinate): [Coordinate, Coordinate] | null {
  let [x0, y0] = start;
  let [x1, y1] = end;
  let code0 = outCode([x0, y0]);
  let code1 = outCode([x1, y1]);

  while (true) {
    if (!(code0 | code1)) return [[x0, y0], [x1, y1]];
    if (code0 & code1) return null;

    const codeOut = code0 || code1;
    let x = 0;
    let y = 0;
    if (codeOut & TOP) {
      x = x0 + ((x1 - x0) * (ISO_NE_BOUNDS.north - y0)) / (y1 - y0);
      y = ISO_NE_BOUNDS.north;
    } else if (codeOut & BOTTOM) {
      x = x0 + ((x1 - x0) * (ISO_NE_BOUNDS.south - y0)) / (y1 - y0);
      y = ISO_NE_BOUNDS.south;
    } else if (codeOut & RIGHT) {
      y = y0 + ((y1 - y0) * (ISO_NE_BOUNDS.east - x0)) / (x1 - x0);
      x = ISO_NE_BOUNDS.east;
    } else if (codeOut & LEFT) {
      y = y0 + ((y1 - y0) * (ISO_NE_BOUNDS.west - x0)) / (x1 - x0);
      x = ISO_NE_BOUNDS.west;
    }

    if (codeOut === code0) {
      x0 = x;
      y0 = y;
      code0 = outCode([x0, y0]);
    } else {
      x1 = x;
      y1 = y;
      code1 = outCode([x1, y1]);
    }
  }
}

function dedupeAdjacent(coordinates: Coordinate[]): Coordinate[] {
  return coordinates.filter((coordinate, index) => index === 0 || !sameCoordinate(coordinates[index - 1], coordinate));
}

function sameCoordinate(a: Coordinate, b: Coordinate) {
  return Math.abs(a[0] - b[0]) < 0.000001 && Math.abs(a[1] - b[1]) < 0.000001;
}

function roundCoordinate([longitude, latitude]: Coordinate): Coordinate {
  return [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))];
}

function isCoordinatePair(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number";
}
