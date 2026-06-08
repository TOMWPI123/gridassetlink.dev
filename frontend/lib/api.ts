"use client";

import type { UserSession } from "@/types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1" ? "/backend" : "http://localhost:8000");
const AUTH_ENABLED = process.env.NEXT_PUBLIC_ENABLE_AUTH === "true";

export function getSession(): UserSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("telecomne-session");
  if (!raw) return null;
  try { return JSON.parse(raw) as UserSession; } catch { return null; }
}

export function saveSession(session: UserSession) { window.localStorage.setItem("telecomne-session", JSON.stringify(session)); }
export function clearSession() { window.localStorage.removeItem("telecomne-session"); }
export function currentRole(): string { return getSession()?.user.role || "demo_engineer"; }
export function canWrite(): boolean { return true; }

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", headers.get("Content-Type") || "application/json");
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
