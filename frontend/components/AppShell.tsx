"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Search, Shield } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { appNavGroups } from "@/components/navigation";
import { DemoDisclaimerGate } from "@/components/DemoDisclaimerGate";
import { AUTH_ENABLED, clearSession, getSession } from "@/lib/api";
import type { UserSession } from "@/types";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isDashboard = pathname === "/" || pathname === "/dashboard";
  const isLogin = pathname === "/login";
  const [session, setSession] = useState<UserSession | null>(null);
  const [ready, setReady] = useState(!AUTH_ENABLED);
  const visibleNavGroups = useMemo(() => appNavGroups, []);

  useEffect(() => {
    if (!AUTH_ENABLED) {
      setReady(true);
      return;
    }
    const nextSession = getSession();
    setSession(nextSession);
    setReady(true);
    if (!nextSession && !isLogin) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/dashboard")}`);
    }
    if (nextSession && isLogin) {
      const requestedNext = new URLSearchParams(window.location.search).get("next");
      const safeNext = requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";
      router.replace(safeNext);
    }
  }, [isLogin, pathname, router]);

  function signOut() {
    clearSession();
    setSession(null);
    router.push("/login");
  }

  if (AUTH_ENABLED && !ready) {
    return (
      <div className="auth-loading-shell">
        <Shield size={18} />
        <span>Checking account session...</span>
      </div>
    );
  }

  if (AUTH_ENABLED && !session && !isLogin) {
    return (
      <div className="auth-loading-shell">
        <Shield size={18} />
        <span>Redirecting to sign in...</span>
      </div>
    );
  }

  return (
    <DemoDisclaimerGate>
      <div className={`shell ${isDashboard ? "dashboard-shell" : ""}`}>
        {!isDashboard ? (
          <aside className="sidebar">
            <div className="brand"><div className="brand-mark">NE</div><div><div style={{ fontWeight: 800 }}>TelecomNE</div><div className="subtle" style={{ color: "#a9bac9" }}>Grid Asset Links</div></div></div>
            {visibleNavGroups.map((group) => (
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
              <div className="toolbar">
                {AUTH_ENABLED && session ? <span className="badge gray">{session.user.full_name} / {session.user.role}</span> : <span className="badge gray">Local demo mode</span>}
                {AUTH_ENABLED && session ? <button className="icon-button" type="button" title="Sign out" onClick={signOut}><LogOut size={16} /></button> : null}
              </div>
            </div>
          ) : null}
          {isDashboard && AUTH_ENABLED && session ? (
            <div className="dashboard-account-chip" role="status">
              <span>{session.user.full_name}</span>
              <small>{session.user.role}</small>
              <button type="button" onClick={signOut}>Sign out</button>
            </div>
          ) : null}
          <div className={`content ${isDashboard ? "dashboard-content" : ""}`}>{children}</div>
        </main>
      </div>
    </DemoDisclaimerGate>
  );
}
