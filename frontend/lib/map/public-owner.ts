export const UNKNOWN_PUBLIC_OWNER = "Unknown public owner";

export type PublicOwnerSource = "hifld_owner_field" | "line_name_owner_token" | "unknown";
export type PublicOwnerConfidence = "public_record" | "line_name_token" | "unknown";

export type PublicOwnerResolution = {
  owner: string;
  source: PublicOwnerSource;
  confidence: PublicOwnerConfidence;
};

const ownerAliases = new Map<string, string>([
  ["PUBLIC SERVICE CO OF NH", "Eversource Energy"],
  ["PUBLIC SERVICE COMPANY OF NEW HAMPSHIRE", "Eversource Energy"],
  ["CONNECTICUT LIGHT & POWER CO", "Eversource Energy"],
  ["CONNECTICUT LIGHT AND POWER CO", "Eversource Energy"],
  ["WESTERN MASSACHUSETTS ELEC CO", "Eversource Energy"],
  ["WESTERN MASSACHUSETTS ELECTRIC CO", "Eversource Energy"],
  ["NSTAR ELECTRIC COMPANY", "Eversource Energy"],
  ["NSTAR ELECTRIC CO", "Eversource Energy"],
  ["CENTRAL MAINE POWER CO", "Central Maine Power"],
  ["CENTRAL MAINE POWER COMPANY", "Central Maine Power"],
  ["VERMONT ELECTRIC POWER CO", "Vermont Electric Power Company"],
  ["VERMONT ELECTRIC POWER COMPANY", "Vermont Electric Power Company"],
  ["LONG ISLAND POWER AUTHORITY", "Long Island Power Authority"],
  ["CITIZENS UTILITIES CO", "Citizens Utilities Company"],
]);

const lineNameOwnerPatterns: Array<{ pattern: RegExp; owner: string }> = [
  { pattern: /\bEVERSOURCE\b/, owner: "Eversource Energy" },
  { pattern: /\bNSTAR\b/, owner: "Eversource Energy" },
  { pattern: /\bCL\s*&\s*P\b|\bCLP\b|\bCONNECTICUT LIGHT\b/, owner: "Eversource Energy" },
  { pattern: /\bPSNH\b|\bPUBLIC SERVICE CO(?:MPANY)? OF NH\b/, owner: "Eversource Energy" },
  { pattern: /\bWMECO\b|\bWESTERN MASS(?:ACHUSETTS)? ELECTRIC\b/, owner: "Eversource Energy" },
  { pattern: /\bNATIONAL GRID\b|\bNEW ENGLAND POWER\b|\bMASSACHUSETTS ELECTRIC\b|\bNARRAGANSETT ELECTRIC\b/, owner: "National Grid" },
  { pattern: /\bCENTRAL MAINE POWER\b|\bCMP\b/, owner: "Central Maine Power" },
  { pattern: /\bVERMONT ELECTRIC POWER\b|\bVELCO\b/, owner: "Vermont Electric Power Company" },
  { pattern: /\bGREEN MOUNTAIN POWER\b|\bGMP\b/, owner: "Green Mountain Power" },
  { pattern: /\bUNITIL\b|\bFITCHBURG GAS\b/, owner: "Unitil" },
  { pattern: /\bUNITED ILLUMINATING\b|\bUI\b/, owner: "United Illuminating Company" },
  { pattern: /\bRHODE ISLAND ENERGY\b/, owner: "Rhode Island Energy" },
  { pattern: /\bVERSANT POWER\b|\bBANGOR HYDRO\b|\bMAINE PUBLIC SERVICE\b/, owner: "Versant Power" },
  { pattern: /\bLIPA\b|\bLONG ISLAND POWER AUTHORITY\b/, owner: "Long Island Power Authority" },
];

export function resolvePublicTransmissionOwner(rawOwner?: string | null, lineName?: string | null): PublicOwnerResolution {
  const owner = normalizePublicOwnerName(rawOwner);
  if (owner) {
    return { owner, source: "hifld_owner_field", confidence: "public_record" };
  }
  const lineNameOwner = inferOwnerFromPublicLineName(lineName);
  if (lineNameOwner) {
    return { owner: lineNameOwner, source: "line_name_owner_token", confidence: "line_name_token" };
  }
  return { owner: UNKNOWN_PUBLIC_OWNER, source: "unknown", confidence: "unknown" };
}

export function publicTransmissionLineOwner(properties: { owner?: string | null; utilityOwner?: string | null }) {
  return properties.utilityOwner || properties.owner || UNKNOWN_PUBLIC_OWNER;
}

function normalizePublicOwnerName(value?: string | null) {
  const cleaned = cleanPublicOwnerText(value);
  if (!cleaned) return "";
  return ownerAliases.get(cleaned.toUpperCase()) || titleCaseOwner(cleaned);
}

function inferOwnerFromPublicLineName(value?: string | null) {
  const cleaned = cleanPublicOwnerText(value);
  if (!cleaned) return "";
  const upper = cleaned.toUpperCase();
  return lineNameOwnerPatterns.find(({ pattern }) => pattern.test(upper))?.owner || "";
}

function cleanPublicOwnerText(value?: string | null) {
  const text = String(value || "").trim();
  if (!text || /^unknown$/i.test(text) || /^not available$/i.test(text) || text === "-999999") return "";
  return text.replace(/\s+/g, " ");
}

function titleCaseOwner(value: string) {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase())
    .replace(/\bCo\b/g, "Co")
    .replace(/\bLlc\b/g, "LLC")
    .replace(/\bLp\b/g, "LP")
    .replace(/\bNh\b/g, "NH");
}
