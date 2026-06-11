"use client";

import { Cable, ClipboardList, Cpu, Database, GitBranch, LogIn, Map, Network, Shield } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { login } from "@/lib/api";

const demos = [["admin@example.com", "admin123"], ["engineer@example.com", "engineer123"], ["fieldtech@example.com", "fieldtech123"], ["viewer@example.com", "viewer123"], ["sqlanalyst@example.com", "sql123"]];
const modules = [
  { label: "RegionalGrid map", detail: "Browse New England assets", href: "/regional-grid", icon: Map },
  { label: "Synthetic ICON", detail: "Rings and 64 circuits", href: "/regional-grid/sel-icon-synthetic-network", icon: Network },
  { label: "DeviceOps", detail: "Actual/planned/proposed state", href: "/deviceops", icon: Shield },
  { label: "ICON modules", detail: "Clickable slot dashboards", href: "/deviceops/icon", icon: Network },
  { label: "ICON provisioning", detail: "Cards, circuits, parameters", href: "/deviceops/icon/provisioning", icon: Cpu },
  { label: "OPGW assumptions", detail: "Assumed route queue", href: "/regional-grid/opgw-assumptions", icon: Cable },
  { label: "Regional lines", detail: "Voltage and owner filters", href: "/regional-grid/transmission-lines", icon: GitBranch },
  { label: "Work orders", detail: "Field installation tasks", href: "/work-orders", icon: ClipboardList },
  { label: "SQL reports", detail: "Saved mismatch reports", href: "/sql-reports", icon: Database },
];

export function AuthPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try { await login(email, password); router.push(nextPath); } catch (err) { setError(err instanceof Error ? err.message : "Login failed"); }
  }
  async function openModule(href: string) {
    setError("");
    try {
      await login(email, password);
      router.push(href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }
  return (
    <div className="panel" style={{ maxWidth: 980, margin: "24px auto" }}>
      <div className="panel-header"><div><h1 className="eyebrowless-title">TelecomNE Grid Asset Links</h1><div className="subtle">Fictional utility telecom planning and asset management MVP</div></div></div>
      <div className="panel-body" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(280px,.8fr)", gap: 18 }}>
        <div className="module-grid auth-module-grid">{modules.map(({ label, detail, href, icon: Icon }) => <button className="module-card" type="button" key={href} onClick={() => openModule(href)}><span className="module-icon"><Icon size={18} /></span><span><span className="field-label">Demo Module</span><strong>{label}</strong><span className="subtle">{detail}</span></span></button>)}</div>
        <form onSubmit={submit}>
          <strong>Sign in</strong>
          <p className="subtle" style={{ marginTop: 8 }}>Accounts gate administration, database edits, materialization, SQL, and field workflows. Demo credentials are seeded for local planning use.</p>
          <div style={{ marginTop: 14 }}><label className="field-label">Email</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div style={{ marginTop: 10 }}><label className="field-label">Password</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {error ? <p className="badge red" style={{ marginTop: 12 }}>{error}</p> : null}
          <button className="button primary" style={{ width: "100%", marginTop: 14 }}><LogIn size={16} /> Sign in</button>
          <div className="toolbar" style={{ marginTop: 14 }}>{demos.map(([demoEmail, demoPassword]) => <button className="button" type="button" key={demoEmail} onClick={() => { setEmail(demoEmail); setPassword(demoPassword); }}>{demoEmail.split("@")[0]}</button>)}</div>
        </form>
      </div>
    </div>
  );
}
