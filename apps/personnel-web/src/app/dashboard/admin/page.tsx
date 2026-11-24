"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { getSupabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import AIVolumeSurgeControls from "@/components/AIVolumeSurgeControls";
import type { PersonnelRole } from "@/lib/types";

interface PersonnelRecord {
  id: string;
  full_name: string;
  email: string;
  role: PersonnelRole;
  created_at: string;
}

type PersonnelInviteRole = Exclude<PersonnelRole, "resident">;

function isPersonnelRole(role: unknown): role is PersonnelRole {
  return role === "resident" ||
    role === "responder" ||
    role === "communication_officer" ||
    role === "admin" ||
    role === "super_admin";
}

function isPersonnelInviteRole(role: string): role is PersonnelInviteRole {
  return role === "responder" ||
    role === "communication_officer" ||
    role === "admin" ||
    role === "super_admin";
}

async function getFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (
    typeof error === "object" &&
    error !== null &&
    "context" in error &&
    error.context instanceof Response
  ) {
    const payload: unknown = await error.context.clone().json().catch(() => null);
    if (
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
    ) {
      return payload.error;
    }
  }
  return error instanceof Error ? error.message : fallback;
}

const PERSONNEL_INVITE_ROLES: Array<{
  value: PersonnelInviteRole;
  label: string;
  superAdminOnly?: boolean;
}> = [
  { value: "responder", label: "Responder" },
  { value: "communication_officer", label: "Communication Officer" },
  { value: "admin", label: "Admin", superAdminOnly: true },
  { value: "super_admin", label: "Super Admin", superAdminOnly: true },
];

const ROLE_BADGES: Record<string, { label: string; class: string }> = {
  super_admin: { label: "Super Admin", class: "badge-red" },
  admin: { label: "Admin", class: "badge-red" },
  communication_officer: { label: "Communication Officer", class: "badge-blue" },
  responder: { label: "Responder", class: "badge-green" },
  resident: { label: "Resident", class: "badge-yellow" },
};

export default function AdminPage() {
  const toast = useToast();
  const [personnel, setPersonnel] = useState<PersonnelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentRole, setCurrentRole] = useState<PersonnelRole | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<PersonnelInviteRole>("responder");
  const [inviting, setInviting] = useState(false);

  const loadPersonnel = useCallback(async () => {
    try {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: myProfile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (myProfile && isPersonnelRole(myProfile.role)) {
          setCurrentRole(myProfile.role);
        }
      }

      const { data, error } = await supabase.functions.invoke<{
        personnel: PersonnelRecord[];
      }>("manage-personnel", { body: { action: "list" } });
      if (error) throw error;
      if (!data || !Array.isArray(data.personnel)) {
        throw new Error("The personnel directory response was invalid.");
      }
      setPersonnel(data.personnel);
      setLoading(false);
    } catch (err: unknown) {
      console.error("Failed to load staff list:", err);
      toast.error("Could not load staff accounts.");
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadPersonnel();
    });
  }, [loadPersonnel]);

  const handleRoleChange = async (userId: string, newRole: PersonnelRole) => {
    setUpdatingId(userId);
    try {
      const { error } = await getSupabase().rpc("assign_personnel_role", {
        p_user_id: userId,
        p_role: newRole,
      });

      if (error) throw error;
      toast.success("Role successfully updated.");
      void loadPersonnel();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to change personnel role.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleInviteSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fullName = inviteFullName.trim();
    const email = inviteEmail.trim().toLowerCase();
    if (!fullName || !email) {
      toast.error("Enter the personnel member’s name and email address.");
      return;
    }
    if (
      currentRole !== "super_admin" &&
      (inviteRole === "admin" || inviteRole === "super_admin")
    ) {
      toast.error("Only a super admin can invite admins or super admins.");
      return;
    }

    setInviting(true);
    try {
      const { data, error } = await getSupabase().functions.invoke<{ invited: boolean }>(
        "manage-personnel",
        {
          body: { action: "invite", fullName, email, role: inviteRole },
        },
      );
      if (error) {
        throw new Error(
          await getFunctionErrorMessage(error, "Unable to send the personnel invitation."),
        );
      }
      if (!data || data.invited !== true) {
        throw new Error("The personnel invitation was not confirmed.");
      }

      toast.success(`Invitation sent to ${email}.`);
      setInviteFullName("");
      setInviteEmail("");
      setInviteRole("responder");
      void loadPersonnel();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unable to send the personnel invitation.");
    } finally {
      setInviting(false);
    }
  };

  const handleSendResetPassword = async (email: string) => {
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success(`Password reset link sent to ${email}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send reset link.");
    }
  };

  const filtered = useMemo(() => {
    return personnel.filter((p) => {
      const s = `${p.full_name || ""} ${p.email || ""} ${p.role || ""}`.toLowerCase();
      return s.includes(search.toLowerCase());
    });
  }, [personnel, search]);

  const counts = useMemo(() => {
    return {
      super_admin: personnel.filter((p) => p.role === "super_admin").length,
      admin: personnel.filter((p) => p.role === "admin").length,
      communication_officer: personnel.filter((p) => p.role === "communication_officer").length,
      responder: personnel.filter((p) => p.role === "responder").length,
    };
  }, [personnel]);

  return (
    <div style={{ display: "contents" }}>
      <header className="header" id="admin-header">
        <div className="header-title-sec">
          <h2>Admin Controls</h2>
        </div>
        <div className="admin-header-stats">
          {currentRole === "super_admin" && (
            <div className="stat-chip">
              <span className="stat-indicator" style={{ backgroundColor: "var(--color-red)", boxShadow: "0 0 8px var(--color-red)" }}></span>
              <span>{counts.super_admin} Super Admin</span>
            </div>
          )}
          <div className="stat-chip">
            <span className="stat-indicator" style={{ backgroundColor: "var(--color-blue)", boxShadow: "0 0 8px var(--color-blue)" }}></span>
            <span>{counts.admin} Admins</span>
          </div>
          <div className="stat-chip">
            <span className="stat-indicator" style={{ backgroundColor: "var(--color-yellow)", boxShadow: "0 0 8px var(--color-yellow)" }}></span>
            <span>{counts.communication_officer} Communication officers</span>
          </div>
          <div className="stat-chip">
            <span className="stat-indicator" style={{ backgroundColor: "var(--color-green)", boxShadow: "0 0 8px var(--color-green)" }}></span>
            <span>{counts.responder} Responders</span>
          </div>
          <div className="stat-chip">
            <span>{personnel.length} Staff</span>
          </div>
        </div>
      </header>

      <div className="admin-content" id="admin-content">
        <div className="admin-panel">
          <nav aria-label="Admin control sections" className="admin-section-navigation">
            <a className="admin-section-link" href="#personnel-directory">Staff directory</a>
            <a className="admin-section-link" href="#ai-volume-surge">AI usage and activity</a>
          </nav>

          {(currentRole === "admin" || currentRole === "super_admin") && (
            <section className="admin-section-card" aria-labelledby="invite-personnel-title">
              <div style={{ marginBottom: "16px" }}>
                <h3 id="invite-personnel-title" style={{ margin: 0, color: "var(--text-primary)" }}>
                  Invite a staff member
                </h3>
                <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", fontSize: "14px" }}>
                  Send an account setup link and assign a role. The new staff member will set their own password.
                </p>
              </div>
              <form
                onSubmit={(event) => void handleInviteSubmit(event)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                  gap: "12px",
                  alignItems: "end",
                }}
              >
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", color: "var(--text-secondary)", fontSize: "14px" }}>
                  Full name
                  <input
                    autoComplete="name"
                    className="page-filter-select"
                    maxLength={120}
                    onChange={(event) => setInviteFullName(event.target.value)}
                    required
                    style={{ width: "100%", fontWeight: 400 }}
                    value={inviteFullName}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", color: "var(--text-secondary)", fontSize: "14px" }}>
                  Email address
                  <input
                    autoComplete="email"
                    className="page-filter-select"
                    maxLength={254}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    required
                    style={{ width: "100%", fontWeight: 400 }}
                    type="email"
                    value={inviteEmail}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", color: "var(--text-secondary)", fontSize: "14px" }}>
                  Staff role
                  <select
                    className="page-filter-select"
                    onChange={(event) => {
                      if (isPersonnelInviteRole(event.target.value)) {
                        setInviteRole(event.target.value);
                      }
                    }}
                    style={{ width: "100%" }}
                    value={inviteRole}
                  >
                    {PERSONNEL_INVITE_ROLES
                      .filter((option) => !option.superAdminOnly || currentRole === "super_admin")
                      .map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                  </select>
                </label>
                <button className="btn btn-primary" disabled={inviting} type="submit">
                  {inviting ? "Sending invitation…" : "Send invitation"}
                </button>
              </form>
            </section>
          )}

          <section aria-labelledby="personnel-directory-heading" className="admin-personnel-directory" id="personnel-directory">
            <div className="admin-personnel-directory-header">
              <div>
                <p className="admin-personnel-kicker">STAFF ACCESS</p>
                <h3 id="personnel-directory-heading">Staff directory</h3>
              </div>
              <span className="admin-personnel-count">{filtered.length} shown</span>
            </div>

            <div className="page-toolbar">
              <div className="page-search-wrapper">
                <input
                  type="text"
                  className="page-search-input"
                  placeholder="Search staff name, email, or role…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: "16px" }}
                />
              </div>
            </div>

            <div className="data-table-card admin-personnel-table-card">
              <div className="data-table-scroll">
                {loading ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                    Loading staff list…
                  </div>
                ) : (
                  <table className="data-table">
                  <thead>
                    <tr>
                      <th>Staff name</th>
                      <th>Email</th>
                      <th>Current Role</th>
                      <th>Date added</th>
                      <th>Change role</th>
                      <th>Password reset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr className="empty-row">
                        <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                          No staff accounts match your search.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((member) => {
                        const badge = ROLE_BADGES[member.role] || { label: member.role, class: "badge-green" };
                        const isUpdating = updatingId === member.id;

                        return (
                          <tr key={member.id}>
                            <td>
                              <strong>{member.full_name || "MDRRMO Staff"}</strong>
                            </td>
                            <td className="cell-muted">{member.email}</td>
                            <td>
                              <span className={`badge ${badge.class}`}>{badge.label}</span>
                            </td>
                            <td className="cell-muted">
                              {new Date(member.created_at).toLocaleDateString("en-PH", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </td>
                            <td>
                              <select
                                className="select-status"
                                value={member.role}
                                onChange={(e) => handleRoleChange(member.id, e.target.value as PersonnelRole)}
                                disabled={isUpdating || (member.role === "super_admin" && currentRole !== "super_admin")}
                                style={{ minHeight: "36px", fontSize: "14px" }}
                              >
                                {currentRole === "super_admin" && (
                                  <option value="super_admin">Super Admin</option>
                                )}
                                <option value="admin">Admin</option>
                                <option value="communication_officer">Communication Officer</option>
                                <option value="responder">Responder</option>
                              </select>
                            </td>
                            <td>
                              <button
                                className="btn btn-google"
                                onClick={() => handleSendResetPassword(member.email)}
                                style={{ width: "auto", minHeight: "44px", padding: "8px 12px", fontSize: "15px" }}
                                type="button"
                              >
                                Send password reset link
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>

          <section
            aria-label="AI usage and activity controls"
            className="admin-section-card"
            id="ai-volume-surge"
            style={{ scrollMarginTop: "24px" }}
          >
            <AIVolumeSurgeControls />
          </section>
        </div>
      </div>
    </div>
  );
}
