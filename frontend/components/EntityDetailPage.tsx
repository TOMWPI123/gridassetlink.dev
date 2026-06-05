"use client";

import Link from "next/link";
import { RefreshCw, QrCode } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch, displayValue, formatLabel } from "@/lib/api";
import type { EntityConfig, JsonRecord } from "@/types";
import { Badge } from "@/components/Badges";

export function EntityDetailPage({ config, id }: { config: EntityConfig; id: string }) {
  const [item, setItem] = useState<JsonRecord | null>(null);
  const [tab, setTab] = useState("Overview");
  const [error, setError] = useState("");
  async function load() { setError(""); try { setItem(await apiFetch<JsonRecord>(`${config.endpoint}/${id}`)); } catch (err) { setError(err instanceof Error ? err.message : "Could not load detail"); } }
  useEffect(() => { load(); }, [config.endpoint, id]);
  if (error) return <div className="badge red">{error}</div>;
  if (!item) return <div className="panel panel-body">Loading detail...</div>;
  const title = String(item.circuit_id || item.device_name || item.substation_code || item.node_name || item.cable_id || item.work_order_number || item.provider_name || item.id);
  const tabs = ["Overview", "Connectivity", "Circuits", "Fiber", "Work Orders", "Attachments", "Audit Log"];
  const actions = detailActions(config.key, id);
  return (
    <>
      <div className="page-header"><div><h1 className="eyebrowless-title">{title}</h1><div className="subtle">{config.title} detail</div></div><div className="toolbar">{actions.map((action) => <Link className="button" href={action.href} key={action.href}>{action.label}</Link>)}{item.status ? <Badge value={item.status} /> : null}<button className="icon-button" onClick={load}><RefreshCw size={16} /></button><button className="icon-button"><QrCode size={16} /></button></div></div>
      <div className="tabs">{tabs.map((name) => <button key={name} className={`tab ${tab === name ? "active" : ""}`} onClick={() => setTab(name)}>{name}</button>)}</div>
      {tab === "Connectivity" ? <div className="panel"><div className="panel-body"><div className="map-ready">{item.latitude && item.longitude ? `${item.latitude}, ${item.longitude}` : "Latitude / longitude fields ready"}</div></div></div> : <Overview item={item} />}
    </>
  );
}

function Overview({ item }: { item: JsonRecord }) {
  return <div className="panel"><div className="panel-body"><div className="detail-grid">{Object.entries(item).map(([key, value]) => <div className="field" key={key}><div className="field-label">{formatLabel(key)}</div><div className="field-value">{key === "status" || key === "criticality" ? <Badge value={value} /> : displayValue(value)}</div></div>)}</div></div></div>;
}

function detailActions(key: string, id: string): { href: string; label: string }[] {
  if (key === "fiber-cables") return [{ href: `/fiber-cables/${id}/strand-assignments`, label: "Strands" }, { href: `/fiber-cables/${id}/splice-map`, label: "Splice Map" }];
  if (key === "splice-closures") return [{ href: `/splice-closures/${id}/trays`, label: "Trays" }, { href: `/splice-closures/${id}/splices`, label: "Splices" }];
  if (key === "patch-panels") return [{ href: `/patch-panels/${id}/port-map`, label: "Port Map" }];
  if (key === "devices") return [{ href: `/devices/${id}/fiber-connectivity`, label: "Fiber" }];
  return [];
}
