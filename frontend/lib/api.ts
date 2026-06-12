"use client";

import type { UserSession } from "@/types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1" ? "/backend" : "http://localhost:8000");
export const LOCAL_GIS_API_BASE = "http://127.0.0.1:8000";
export const GIS_API_BASE_STORAGE_KEY = "gridassetlink-gis-api-base";
export const AUTH_ENABLED = process.env.NEXT_PUBLIC_ENABLE_AUTH === "true";
const WRITE_ROLES = new Set(["admin", "engineer", "editor"]);
const ADMIN_ROLES = new Set(["admin"]);

export function getSession(): UserSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("telecomne-session");
  if (!raw) return null;
  try { return JSON.parse(raw) as UserSession; } catch { return null; }
}

export function saveSession(session: UserSession) { window.localStorage.setItem("telecomne-session", JSON.stringify(session)); }
export function clearSession() { window.localStorage.removeItem("telecomne-session"); }
export function currentRole(): string { return getSession()?.user.role || (AUTH_ENABLED ? "viewer" : "demo_engineer"); }
export function canWrite(): boolean { return !AUTH_ENABLED || WRITE_ROLES.has(currentRole()); }
export function canAdmin(): boolean { return !AUTH_ENABLED || ADMIN_ROLES.has(currentRole()); }

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  maybeAttachJsonContentType(headers, init.body);
  maybeAttachAuth(headers);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    const detail = await response.text();
    if (isExpiredTokenResponse(response, detail)) {
      clearSession();
      headers.delete("Authorization");
      const retry = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
      if (!retry.ok) throw new Error(await retry.text());
      return retry.json() as Promise<T>;
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export function normalizeApiBase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return API_BASE;
  if (trimmed.startsWith("/")) return trimmed.replace(/\/+$/, "") || "/";
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(candidate);
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.origin}${path}`;
  } catch {
    return API_BASE;
  }
}

export function getStoredGisApiBase(): string {
  if (typeof window === "undefined") return API_BASE;
  return normalizeApiBase(window.localStorage.getItem(GIS_API_BASE_STORAGE_KEY) || API_BASE);
}

export function saveGisApiBase(value: string): string {
  const normalized = normalizeApiBase(value);
  if (typeof window !== "undefined") window.localStorage.setItem(GIS_API_BASE_STORAGE_KEY, normalized);
  return normalized;
}

export function clearStoredGisApiBase(): string {
  if (typeof window !== "undefined") window.localStorage.removeItem(GIS_API_BASE_STORAGE_KEY);
  return API_BASE;
}

export function buildApiUrl(apiBase: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = normalizeApiBase(apiBase).replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export async function fetchFromApiBase<T>(apiBase: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  maybeAttachJsonContentType(headers, init.body);
  maybeAttachAuth(headers);
  const requestUrl = buildApiUrl(apiBase, path);
  const response = await fetch(requestUrl, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    const detail = await response.text();
    if (isExpiredTokenResponse(response, detail)) {
      clearSession();
      headers.delete("Authorization");
      const retry = await fetch(requestUrl, { ...init, headers, cache: "no-store" });
      if (!retry.ok) throw new Error(await retry.text());
      return retry.json() as Promise<T>;
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export async function apiDownload(path: string, filename: string) {
  const headers = new Headers();
  maybeAttachAuth(headers);
  const response = await fetch(`${API_BASE}${path}`, { headers });
  if (!response.ok) {
    const detail = await response.text();
    if (isExpiredTokenResponse(response, detail)) {
      clearSession();
      headers.delete("Authorization");
      const retry = await fetch(`${API_BASE}${path}`, { headers });
      if (!retry.ok) throw new Error(await retry.text());
      return downloadResponse(retry, filename);
    }
    throw new Error(detail);
  }
  return downloadResponse(response, filename);
}

function maybeAttachAuth(headers: Headers) {
  if (!AUTH_ENABLED) return;
  const session = getSession();
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
}

function maybeAttachJsonContentType(headers: Headers, body: BodyInit | null | undefined) {
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (!isFormData) headers.set("Content-Type", headers.get("Content-Type") || "application/json");
}

function isExpiredTokenResponse(response: Response, detail: string) {
  return response.status === 401 && detail.toLowerCase().includes("token expired");
}

async function downloadResponse(response: Response, filename: string) {
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

export async function login(email: string, password: string): Promise<UserSession> {
  const session = await apiFetch<UserSession>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  saveSession(session);
  return session;
}

export function formatLabel(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
