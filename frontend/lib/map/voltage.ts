import type { TransmissionVoltageClass } from "../types/assets";

export type TransmissionLineStyle = {
  color: string;
  width: number;
  opacity: number;
  dasharray?: number[];
};

export function parseVoltageKv(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, " ").match(/-?\d+(?:\.\d+)?/);
  if (!normalized) return null;
  const parsed = Number(normalized[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getVoltageClass(voltageKv: number | null): TransmissionVoltageClass {
  if (voltageKv === null || !Number.isFinite(voltageKv)) return "unknown";
  if (voltageKv >= 735) return "735+";
  if (voltageKv >= 500) return "500-734";
  if (voltageKv >= 345) return "345-499";
  if (voltageKv >= 230) return "230-344";
  if (voltageKv >= 115) return "115-229";
  if (voltageKv >= 69) return "69-114";
  if (voltageKv > 0) return "below-69";
  return "unknown";
}

export function getTransmissionLineStyle(voltageClass: string): TransmissionLineStyle {
  switch (voltageClass) {
    case "735+":
      return { color: "#f4ffff", width: 6.8, opacity: 0.98 };
    case "500-734":
      return { color: "#34f5ff", width: 6, opacity: 0.95 };
    case "345-499":
      return { color: "#19d2ff", width: 5.2, opacity: 0.92 };
    case "230-344":
      return { color: "#4f93ff", width: 4.5, opacity: 0.9 };
    case "115-229":
      return { color: "#b390ff", width: 3.7, opacity: 0.88 };
    case "69-114":
      return { color: "#78aaa5", width: 3.1, opacity: 0.82 };
    case "below-69":
      return { color: "#6f7d83", width: 2.4, opacity: 0.72 };
    default:
      return { color: "#8c959b", width: 2.2, opacity: 0.7, dasharray: [2, 2] };
  }
}
