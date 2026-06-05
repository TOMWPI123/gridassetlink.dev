"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/lib/api";

const demos = [["admin@example.com", "admin123"], ["engineer@example.com", "engineer123"], ["fieldtech@example.com", "fieldtech123"], ["viewer@example.com", "viewer123"], ["sqlanalyst@example.com", "sql123"]];

export function AuthPanel() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try { await login(email, password); router.push("/dashboard"); } catch (err) { setError(err instanceof Error ? err.message : "Login failed"); }
  }
  return (
    <div className="panel" style={{ maxWidth: 980, margin: "24px auto" }}>
      <div className="panel-header"><div><h1 className="eyebrowless-title">TelecomNE Grid Asset Links</h1><div className="subtle">Fictional utility telecom planning and asset management MVP</div></div></div>
      <div className="panel-body" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(280px,.8fr)", gap: 18 }}>
        <div className="metric-grid">{["SEL ICON networks", "OPGW and distribution fiber", "Protection and SCADA circuits", "Engineer field work orders", "SQL reports", "QR asset links"].map((item) => <div className="metric-card" key={item}><div className="subtle">Module</div><div className="metric-value" style={{ fontSize: 18 }}>{item}</div></div>)}</div>
        <form onSubmit={submit}>
          <strong>Sign in</strong>
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
