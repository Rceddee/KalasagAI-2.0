"use client";

import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ToastProvider } from "@/components/Toast";
import { AuthProvider, hasPermission } from "@/lib/auth-context";
import { useTheme } from "@/components/ThemeContext";
import {
  ShieldIcon,
  GridIcon,
  FolderIcon,
  ChartIcon,
  ClipboardIcon,
  ShieldLockIcon,
  VolumeIcon,
  SunIcon,
  MoonIcon,
} from "@/components/Icons";

const STAFF_ROLES = new Set(["Responder", "Communication Officer", "Admin", "Super Admin"]);

function normalizeEmail(email) {
  return email?.trim().toLowerCase() || "";
}

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState("");
  const [personnelName, setPersonnelName] = useState("");

  useEffect(() => {
    let cancelled = false;

    const denyAccess = async () => {
      sessionStorage.setItem("auth_error", "This account is not authorized to access the KALASAG dashboard.");
      await signOut(auth);
      if (!cancelled) router.replace("/login");
    };

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        if (!cancelled) router.replace("/login");
        return;
      }

      const email = normalizeEmail(currentUser.email);
      if (!email) {
        await denyAccess();
        return;
      }

      try {
        const personnelSnapshot = await getDoc(doc(db, "personnel", email));
        const personnel = personnelSnapshot.exists() ? personnelSnapshot.data() : null;

        if (!personnel || !STAFF_ROLES.has(personnel.role)) {
          await denyAccess();
          return;
        }

        if (!cancelled) {
          setUser(currentUser);
          setRole(personnel.role);
          setPersonnelName(personnel.name || "");
          setLoading(false);
        }
      } catch (error) {
        console.error("Authorization check failed:", error);
        await denyAccess();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (loading) {
    return (
      <div className="login-container" id="dashboard-loading">
        <div className="loader"></div>
      </div>
    );
  }

  const getInitials = (name) => {
    if (!name) return "K";
    return name.split(" ").map((part) => part[0]).join("").substring(0, 2).toUpperCase();
  };

  return (
    <ToastProvider>
        <div className="app-layout" id="dashboard-app-layout">
          <aside className="sidebar" id="dashboard-sidebar">
            <div>
              <div className="sidebar-brand">
                <span className="sidebar-logo"><ShieldIcon size={28} color="var(--color-red)" /></span>
                <span className="sidebar-title">KALASAG AI</span>
              </div>

              <nav className="sidebar-nav">
                {hasPermission(role, "view:command-center") && (
                  <Link href="/dashboard" className={`nav-item ${pathname === "/dashboard" ? "active" : ""}`} id="nav-command-center">
                    <span className="nav-icon"><GridIcon size={20} /></span> Command Center
                  </Link>
                )}
                {hasPermission(role, "view:blotters") && (
                  <Link href="/dashboard/blotters" className={`nav-item ${pathname === "/dashboard/blotters" ? "active" : ""}`} id="nav-incident-logs">
                    <span className="nav-icon"><FolderIcon size={20} /></span> Incident Blotters
                  </Link>
                )}
                {hasPermission(role, "view:analytics") && (
                  <Link href="/dashboard/analytics" className={`nav-item ${pathname === "/dashboard/analytics" ? "active" : ""}`} id="nav-analytics">
                    <span className="nav-icon"><ChartIcon size={20} /></span> Analytics &amp; Reports
                  </Link>
                )}
                {hasPermission(role, "view:ai-volume") && (
                  <Link href="/dashboard/ai-volume" className={`nav-item ${pathname === "/dashboard/ai-volume" ? "active" : ""}`} id="nav-ai-volume">
                    <span className="nav-icon"><VolumeIcon size={20} /></span> AI Volume &amp; Surge
                  </Link>
                )}
                {hasPermission(role, "view:logs") && (
                  <Link href="/dashboard/logs" className={`nav-item ${pathname === "/dashboard/logs" ? "active" : ""}`} id="nav-activity-logs">
                    <span className="nav-icon"><ClipboardIcon size={20} /></span> Activity Logs
                  </Link>
                )}
                {hasPermission(role, "view:admin") && (
                  <Link href="/dashboard/admin" className={`nav-item ${pathname === "/dashboard/admin" ? "active" : ""}`} id="nav-settings">
                    <span className="nav-icon"><ShieldLockIcon size={20} /></span> Admin Controls
                  </Link>
                )}
              </nav>
            </div>

            <div className="sidebar-footer">
              <ThemeToggleControl />

              {user && (
                <div className="user-profile" id="user-profile-section">
                  <div className="user-avatar" id="user-profile-avatar">
                    {user.photoURL ? (
                      <Image src={user.photoURL} alt={user.displayName || "User avatar"} width={36} height={36} sizes="36px" />
                    ) : (
                      <span>{getInitials(personnelName || user.displayName || user.email)}</span>
                    )}
                  </div>
                  <div className="user-info">
                    <span className="user-name">{personnelName || user.displayName || "KALASAG Personnel"}</span>
                    <span className="user-role">{role}</span>
                  </div>
                </div>
              )}
              <button className="btn-logout" id="logout-btn" onClick={handleLogout}>Sign Out</button>
            </div>
          </aside>

          <div className="command-center" id="dashboard-main-shell">
            <AuthProvider user={user} role={role}>
              {children}
            </AuthProvider>
          </div>
        </div>
    </ToastProvider>
  );
}

function ThemeToggleControl() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      className="btn btn-google"
      onClick={toggleTheme}
      style={{
        width: "100%",
        padding: "8px 12px",
        fontSize: "12px",
        justifyContent: "center",
        gap: "8px",
        marginBottom: "12px",
        borderColor: "var(--glass-border)",
      }}
      id="theme-toggle-btn"
      title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
    >
      {theme === "dark" ? <SunIcon size={16} color="var(--color-yellow)" /> : <MoonIcon size={16} color="var(--color-blue)" />}
      <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
    </button>
  );
}