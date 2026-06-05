"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, BadgeCheck, Cable, ClipboardList, Database, Factory, FileSpreadsheet, Gauge, GitBranch, HardDrive, Landmark, LogOut, Map, Network, PanelTop, QrCode, Router, Search, Shield, Split, Users, Wrench } from "lucide-react";
import { clearSession, getSession } from "@/lib/api";
import { useEffect, useState } from "react";

const groups = [
  { title: "Operate", items: [["/dashboard", "Dashboard", Gauge], ["/deviceops", "DeviceOps", Network], ["/deviceops/devices", "Ops Devices", HardDrive], ["/regional-grid", "RegionalGrid", Map], ["/substations", "Substations", Landmark], ["/devices", "Devices", HardDrive], ["/device-ports", "Device Ports", Router], ["/work-orders", "Work Orders", ClipboardList], ["/my-work-orders", "My Work Orders", Wrench]] },
  { title: "Plan", items: [["/deviceops/icon", "ICON Ops", Network], ["/icon", "SEL ICON", Network], ["/regional-grid/substations", "Regional Substations", Landmark], ["/regional-grid/transmission-lines", "Regional Lines", GitBranch], ["/regional-grid/opgw-assumptions", "OPGW Assumptions", Cable], ["/regional-grid/sel-icon-synthetic-network", "Synthetic ICON", Network], ["/deviceops/change-requests", "Proposed Changes", ClipboardList], ["/deviceops/service-templates", "Service Templates", Database], ["/transmission-lines", "Transmission Lines", GitBranch], ["/opgw", "OPGW Fiber", Cable], ["/distribution-fiber", "Distribution Fiber", Split], ["/fiber-cables", "Fiber Cables", Cable], ["/fiber-strands", "Fiber Strands", Activity], ["/fiber-assignments", "Fiber Assignments", BadgeCheck], ["/splice-closures", "Splice Closures", Factory], ["/patch-panels", "Patch Panels", PanelTop]] },
  { title: "Analyze", items: [["/deviceops/compare", "DeviceOps Compare", GitBranch], ["/regional-grid/import", "Regional Import", FileSpreadsheet], ["/regional-grid/telecom-overlay", "Regional Overlay", Map], ["/regional-grid/mixed-access", "Mixed Access", Shield], ["/deviceops/commissioning", "Commissioning", ClipboardList], ["/circuits", "Circuits", BadgeCheck], ["/leased-services", "Leased Services", FileSpreadsheet], ["/providers", "Providers", Users], ["/fiber-trace", "Fiber Trace", Map], ["/outage-impact", "Outage Impact", Shield], ["/sql-reports", "SQL Reports", Database], ["/qr-labels", "QR Labels", QrCode], ["/import-export", "Import / Export", FileSpreadsheet]] },
  { title: "Admin", items: [["/admin/users", "Users", Users], ["/admin/audit-log", "Audit Log", Database], ["/admin/settings", "Settings", Shield]] },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [name, setName] = useState("Not signed in");
  const [role, setRole] = useState("");
  useEffect(() => {
    const session = getSession();
    setName(session?.user.full_name || "Not signed in");
    setRole(session?.user.role || "");
  }, [pathname]);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">NE</div><div><div style={{ fontWeight: 800 }}>TelecomNE</div><div className="subtle" style={{ color: "#a9bac9" }}>Grid Asset Links</div></div></div>
        {groups.map((group) => (
          <div key={group.title}>
            <div className="nav-group-title">{group.title}</div>
            {group.items.map(([href, label, Icon]) => <Link className={`nav-link ${pathname === href || pathname.startsWith(`${href}/`) ? "active" : ""}`} href={href} key={href}><Icon size={16} /><span>{label}</span></Link>)}
          </div>
        ))}
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="toolbar" style={{ width: "100%" }}><Search size={16} /><input className="input" placeholder="Search assets, circuits, work orders, providers" /></div>
          <div className="toolbar"><span className="subtle">{name}</span>{role ? <span className="badge gray">{role.replaceAll("_", " ")}</span> : null}<button className="icon-button" onClick={() => { clearSession(); router.push("/"); }} title="Sign out"><LogOut size={16} /></button></div>
        </div>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
