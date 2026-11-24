"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { PersonnelRole } from "@/lib/types";

const modules = [
  { href: "/dashboard", label: "Maps and Reports", mark: "M", allowed: () => true },
  { href: "/dashboard/blotters", label: "Incident Blotters", mark: "B", allowed: () => true },
  { href: "/dashboard/analytics", label: "Analytics & Reports", mark: "A", allowed: () => true },
  { href: "/dashboard/activity", label: "Activity Logs", mark: "L", allowed: (role: PersonnelRole) => role === "communication_officer" || role === "admin" || role === "super_admin" },
  { href: "/dashboard/admin", label: "Admin Controls", mark: "C", allowed: (role: PersonnelRole) => role === "admin" || role === "super_admin" },
];

const roleLabels: Record<PersonnelRole, string> = {
  resident: "Resident",
  responder: "Responder",
  communication_officer: "Communication Officer",
  admin: "Admin",
  super_admin: "Super Admin",
};

export function DashboardShell({
  role,
  fullName,
  children,
}: {
  role: PersonnelRole;
  fullName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [logoutError, setLogoutError] = useState("");

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("kalasagai-theme", next);
  }

  async function logout() {
    setLogoutError("");
    const { error } = await getSupabase().auth.signOut();
    if (error) {
      setLogoutError("Could not sign out. Please try again.");
      return;
    }
    router.replace("/login");
  }

  return (
    <div className="personnel-shell">
      <aside className="sidebar">
        <Link className="dashboard-brand" href="/dashboard">
          <span className="shield-mark" aria-hidden="true">K</span>
          <span>KALASAG<span>AI</span><small>OPERATIONS</small></span>
        </Link>
        <p className="sidebar-caption">OPERATIONS</p>
        <nav className="module-nav" aria-label="Personnel modules">
          {modules.filter((module) => module.allowed(role)).map((module) => (
            <Link
              aria-current={pathname === module.href ? "page" : undefined}
              className={pathname === module.href ? "module-link active" : "module-link"}
              href={module.href}
              key={module.href}
            >
              <span className="module-mark" aria-hidden="true">{module.mark}</span>
              <span>{module.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="secure-label"><span aria-hidden="true">●</span> Secure operations</span>
          <button className="theme-button" onClick={toggleTheme} type="button">
            {theme === "light" ? "◐  Dark appearance" : "☼  Light appearance"}
          </button>
          <div className="operator-card">
            <span className="operator-avatar">{initials(fullName)}</span>
            <span><strong>{fullName}</strong><small>{roleLabels[role]}</small></span>
          </div>
          {logoutError && <p className="sidebar-error" role="alert">{logoutError}</p>}
          <button className="signout-button" onClick={() => void logout()} type="button">Sign out</button>
        </div>
      </aside>
      <main className="operations-main">
        <header className="operations-topbar">
          <div><span className="status-dot" /> LIVE OPERATIONS</div>
          <time dateTime={new Date().toISOString()}>{new Intl.DateTimeFormat("en-PH", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date())} · Philippine Time</time>
        </header>
        {children}
      </main>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "K";
}
