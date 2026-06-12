"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useMemo } from "react";
import { appNavGroups } from "@/components/navigation";
import { DemoDisclaimerGate } from "@/components/DemoDisclaimerGate";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname === "/" || pathname === "/dashboard";
  const visibleNavGroups = useMemo(() => appNavGroups, []);

  return (
    <DemoDisclaimerGate>
      <div className={`shell ${isDashboard ? "dashboard-shell" : ""}`}>
        {!isDashboard ? (
          <aside className="sidebar">
            <div className="brand">
              <div className="brand-mark">NE</div>
              <div>
                <div style={{ fontWeight: 800 }}>TelecomNE</div>
                <div className="subtle" style={{ color: "#a9bac9" }}>Grid Asset Links</div>
              </div>
            </div>
            {visibleNavGroups.map((group) => (
              <div key={group.title}>
                <div className="nav-group-title">{group.title}</div>
                {group.items.map(([href, label, Icon]) => (
                  <Link className={`nav-link ${pathname === href || pathname.startsWith(`${href}/`) ? "active" : ""}`} href={href} key={href}>
                    <Icon size={16} />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            ))}
          </aside>
        ) : null}
        <main className="main">
          {!isDashboard ? (
            <div className="topbar">
              <div className="toolbar" style={{ width: "100%" }}>
                <Search size={16} />
                <input className="input" placeholder="Search assets, circuits, work orders, providers" />
              </div>
              <div className="toolbar">
                <span className="badge gray">No-account synthetic demo</span>
              </div>
            </div>
          ) : null}
          <div className={`content ${isDashboard ? "dashboard-content" : ""}`}>{children}</div>
        </main>
      </div>
    </DemoDisclaimerGate>
  );
}
