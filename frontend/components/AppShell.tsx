"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { clearSession, getSession } from "@/lib/api";
import { useEffect, useState } from "react";
import { appNavGroups } from "@/components/navigation";

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
  const isDashboard = pathname === "/" || pathname === "/dashboard";
  return (
    <div className={`shell ${isDashboard ? "dashboard-shell" : ""}`}>
      {!isDashboard ? (
        <aside className="sidebar">
          <div className="brand"><div className="brand-mark">NE</div><div><div style={{ fontWeight: 800 }}>TelecomNE</div><div className="subtle" style={{ color: "#a9bac9" }}>Grid Asset Links</div></div></div>
          {appNavGroups.map((group) => (
            <div key={group.title}>
              <div className="nav-group-title">{group.title}</div>
              {group.items.map(([href, label, Icon]) => <Link className={`nav-link ${pathname === href || pathname.startsWith(`${href}/`) ? "active" : ""}`} href={href} key={href}><Icon size={16} /><span>{label}</span></Link>)}
            </div>
          ))}
        </aside>
      ) : null}
      <main className="main">
        {!isDashboard ? (
          <div className="topbar">
            <div className="toolbar" style={{ width: "100%" }}><Search size={16} /><input className="input" placeholder="Search assets, circuits, work orders, providers" /></div>
            <div className="toolbar"><span className="subtle">{name}</span>{role ? <span className="badge gray">{role.replaceAll("_", " ")}</span> : null}<button className="icon-button" onClick={() => { clearSession(); router.push("/"); }} title="Sign out"><LogOut size={16} /></button></div>
          </div>
        ) : null}
        <div className={`content ${isDashboard ? "dashboard-content" : ""}`}>{children}</div>
      </main>
    </div>
  );
}
