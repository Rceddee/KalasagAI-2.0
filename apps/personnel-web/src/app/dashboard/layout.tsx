"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ShieldIcon,
  GridIcon,
  ClipboardIcon,
  ChartIcon,
  ShieldLockIcon,
  FolderIcon,
  SunIcon,
  MoonIcon,
} from "@/components/Icons";
import { DashboardAuthProvider } from "@/components/DashboardAuth";
import { useTheme } from "@/components/ThemeContext";
import { getSupabase } from "@/lib/supabase";
import { canAccessAdminModules } from "@/lib/role-access";
import type { PersonnelRole } from "@/lib/types";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [role, setRole] = useState<PersonnelRole>("responder");
  const [fullName, setFullName] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    let version = 0;
    let checkedUserId: string | null = null;

    const checkAuth = async () => {
      const requested = ++version;
      try {
        const supabase = getSupabase();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          if (version === requested) router.replace("/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("full_name, role")
          .eq("id", user.id)
          .single();

        if (version !== requested) return;
        if (profileError || !profile) {
          setAuthError(true);
          setLoading(false);
          return;
        }
        if (profile.role === "resident") {
          await supabase.auth.signOut({ scope: "local" });
          if (version === requested) {
            router.replace("/login");
          }
          return;
        }

        if (version === requested) {
          setAuthError(false);
          checkedUserId = user.id;
          setRole(profile.role);
          setFullName(profile.full_name || user.email?.split("@")[0] || "Operator");
          setLoading(false);
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        if (version === requested) router.replace("/login");
      }
    };

    void checkAuth();
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        version++;
        checkedUserId = null;
        setLoading(true);
        router.replace("/login");
      } else if (event === "SIGNED_IN" && session?.user.id !== checkedUserId) {
        setLoading(true);
        void checkAuth();
      }
    });

    return () => {
      version++;
      subscription.unsubscribe();
    };
  }, [router]);

  const handleLogout = async () => {
    try {
      await getSupabase().auth.signOut();
      router.replace("/login");
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  if (loading) {
    return (
      <div className="login-container" id="dashboard-loading" style={{ minHeight: "100vh" }}>
        <div className="loader"></div>
      </div>
    );
  }

  if (authError) return <p role="alert">Personnel access could not be verified. Reload to try again.</p>;

  const getInitials = (name: string) => {
    if (!name) return "K";
    return name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
  };

  const formatRoleLabel = (r: PersonnelRole) => {
    switch (r) {
      case "super_admin": return "Super Admin";
      case "admin": return "Admin";
      case "communication_officer": return "Communication Officer";
      case "responder": return "Responder";
      default: return "Staff";
    }
  };

  const canAccessAdmin = canAccessAdminModules(role);
  const restricted = ((pathname.startsWith("/dashboard/admin")
    || pathname.startsWith("/dashboard/surge")
    || pathname.startsWith("/dashboard/activity")) && !canAccessAdmin);

  return (
    <div
      className={`app-layout${sidebarCollapsed ? " sidebar-collapsed" : ""}`}
      id="dashboard-app-layout"
    >
      <aside className="sidebar" id="dashboard-sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand-row">
            <div className="sidebar-brand">
              <span className="sidebar-logo">
                <ShieldIcon size={28} color="var(--color-red)" />
              </span>
              <div className="sidebar-brand-copy">
                <span className="sidebar-title">KALASAG AI</span>
                <span className="sidebar-location">Gumaca</span>
              </div>
            </div>
            <button
              aria-controls="dashboard-sidebar"
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="sidebar-collapse-toggle"
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              type="button"
            >
              <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
                <path
                  d={sidebarCollapsed ? "m9 18 6-6-6-6" : "m15 18-6-6 6-6"}
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </button>
          </div>

          <nav className="sidebar-nav">
            <Link
              href="/dashboard"
              className={`nav-item ${pathname === "/dashboard" ? "active" : ""}`}
              id="nav-command-center"
              aria-label="Live Reports and Map"
              title="Live Reports and Map"
            >
              <span className="nav-icon"><GridIcon size={20} /></span>
              <span> Reports & Map</span>
            </Link>

            <Link
              href="/dashboard/blotters"
              className={`nav-item ${pathname.startsWith("/dashboard/blotters") ? "active" : ""}`}
              id="nav-blotters"
              aria-label="Incident Reports"
              title="Incident Reports"
            >
              <span className="nav-icon"><ClipboardIcon size={20} /></span>
              <span>Incident Reports</span>
            </Link>

            <Link
              href="/dashboard/analytics"
              className={`nav-item ${pathname.startsWith("/dashboard/analytics") ? "active" : ""}`}
              id="nav-analytics"
              aria-label="Reports and Trends"
              title="Reports & Trends"
            >
              <span className="nav-icon"><ChartIcon size={20} /></span>
              <span>Reports & Trends</span>
            </Link>

            {canAccessAdmin && (
              <Link
                href="/dashboard/admin"
                className={`nav-item ${pathname.startsWith("/dashboard/admin") ? "active" : ""}`}
                id="nav-admin-controls"
                aria-label="Admin Controls"
                title="Admin Controls"
              >
                <span className="nav-icon"><ShieldLockIcon size={20} /></span>
                <span>Admin Controls</span>
              </Link>
            )}

            {canAccessAdmin && <Link
              href="/dashboard/activity"
              className={`nav-item ${pathname.startsWith("/dashboard/activity") ? "active" : ""}`}
              id="nav-activity-logs"
              aria-label="Activity Log"
              title="Activity Log"
            >
              <span className="nav-icon"><FolderIcon size={20} /></span>
              <span>Activity Log</span>
            </Link>}
          </nav>
        </div>

        <div className="sidebar-footer">
          <button
            className="btn btn-google"
            onClick={toggleTheme}
            type="button"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "14px",
              justifyContent: "center",
              gap: "8px",
              marginBottom: "12px",
              borderColor: "var(--glass-border)",
            }}
            id="theme-toggle-btn"
          >
            {theme === "dark" ? (
              <>
                <SunIcon size={16} color="var(--color-yellow)" />
                <span className="sidebar-action-label">Light Mode</span>
              </>
            ) : (
              <>
                <MoonIcon size={16} color="var(--color-blue)" />
                <span className="sidebar-action-label">Dark Mode</span>
              </>
            )}
          </button>

          <div
            className="user-profile"
            id="user-profile-section"
            role="group"
            aria-label={`${fullName}, ${formatRoleLabel(role)}`}
            title={`${fullName} · ${formatRoleLabel(role)}`}
          >
            <div className="user-avatar" id="user-profile-avatar">
              <span>{getInitials(fullName)}</span>
            </div>
            <div className="user-info">
              <span className="user-name" title={fullName}>{fullName}</span>
              <span className="user-role">{formatRoleLabel(role)}</span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="btn-logout"
            id="sidebar-logout-btn"
            aria-label="Sign out"
            title="Sign Out"
            type="button"
          >
            <svg
              aria-hidden="true"
              className="sidebar-signout-icon"
              fill="none"
              height="18"
              viewBox="0 0 24 24"
              width="18"
            >
              <path d="M10 17l5-5-5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M15 12H3m8-8h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
            <span className="sidebar-action-label">Sign Out</span>
          </button>
        </div>
      </aside>

      <div className="command-center" id="dashboard-main-shell">
        <DashboardAuthProvider role={role} fullName={fullName}>
          {restricted ? <p role="alert">Your personnel role cannot access this module.</p> : children}
        </DashboardAuthProvider>
      </div>
    </div>
  );
}
