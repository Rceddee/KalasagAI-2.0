"use client";

import React, { type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useResidentAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeContext";
import {
  ShieldIcon,
  FileIcon,
  PinIcon,
  ClipboardIcon,
  PersonIcon,
  SunIcon,
  MoonIcon,
} from "@/components/Icons";

export function ResidentShell({ children }: { children: ReactNode }) {
  const { user, loading, error, refreshProfile } = useResidentAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  React.useEffect(() => {
    if (!loading && !error && !user) router.replace("/");
  }, [error, loading, router, user]);

  if (loading && !user) {
    return (
      <main className="resident-screen" style={{ display: "grid", placeItems: "center" }}>
        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Connecting to KALASAG AI…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="resident-screen" style={{ display: "grid", placeItems: "center", padding: "20px", textAlign: "center" }}>
        <p style={{ color: "var(--color-red)", marginBottom: "12px" }}>{error}</p>
        <button
          onClick={() => {
            if (user) void refreshProfile();
            else router.replace("/");
          }}
          className="btn-submit-emergency"
          style={{ width: "auto", padding: "10px 20px" }}
          type="button"
        >
          {user ? "Retry" : "Return to Sign In"}
        </button>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="resident-screen" style={{ display: "grid", placeItems: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Redirecting to sign in…</p>
      </main>
    );
  }

  return (
    <div className="resident-screen">
      {/* Top Header */}
      <header className="resident-app-header">
        <Link className="resident-brand" href="/report">
          <div className="brand-shield-icon">
            <ShieldIcon size={20} color="#FFFFFF" />
          </div>
          <div className="brand-text-wrap">
            <span className="brand-app-name">KALASAG AI</span>
            <span className="brand-tagline">Gumaca Incident Reporter</span>
          </div>
        </Link>

        <nav className="floating-bottom-nav" aria-label="Resident Navigation Tabs">
          <Link
            href="/report"
            className={`tab-link ${pathname === "/report" || pathname === "/" ? "active" : ""}`}
          >
            <FileIcon size={20} />
            <span>Report</span>
          </Link>

          <Link
            href="/dashboard"
            className={`tab-link ${pathname === "/dashboard" ? "active" : ""}`}
          >
            <PinIcon size={20} />
            <span>Map</span>
          </Link>

          <Link
            href="/reports"
            className={`tab-link ${pathname.startsWith("/reports") ? "active" : ""}`}
          >
            <ClipboardIcon size={20} />
            <span>My Reports</span>
          </Link>

          <Link
            href="/profile"
            className={`tab-link ${pathname === "/profile" ? "active" : ""}`}
          >
            <PersonIcon size={20} />
            <span>Profile</span>
          </Link>
        </nav>

        <button
          className="theme-toggle-btn"
          onClick={toggleTheme}
          type="button"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? (
            <>
              <SunIcon size={14} color="var(--color-yellow)" />
              <span>Light</span>
            </>
          ) : (
            <>
              <MoonIcon size={14} color="var(--color-blue)" />
              <span>Dark</span>
            </>
          )}
        </button>
      </header>

      {/* Main Page Content */}
      <main className="resident-main-content">{children}</main>
    </div>
  );
}
