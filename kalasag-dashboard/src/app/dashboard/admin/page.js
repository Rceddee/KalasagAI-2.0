"use client";

import { useState, useEffect, useMemo } from "react";
import { auth, db } from "@/lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
} from "firebase/firestore";
import { PersonIcon } from "@/components/Icons";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { logSystemAction } from "@/lib/logs";
import { useAuth } from "@/lib/auth-context";

const STAFF_ROLES = ["Responder", "Communication Officer"];
const ROLES = [...STAFF_ROLES, "Admin"];
const ROLE_COLORS = {
  "Super Admin": "badge-red",
  Admin: "badge-red",
  "Communication Officer": "badge-blue",
  Responder: "badge-green",
};

export default function AdminPage() {
  const { role: currentRole } = useAuth();
  const isSuperAdmin = currentRole === "Super Admin";
  const assignableRoles = isSuperAdmin ? ROLES : STAFF_ROLES;
  const router = useRouter();
  const [accessChecked, setAccessChecked] = useState(false);
  const [personnel, setPersonnel] = useState([]);
  const [newMember, setNewMember] = useState({ name: "", email: "", role: "Responder" });
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({ name: "", role: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [resettingEmail, setResettingEmail] = useState("");

  const toast = useToast();

  const logPersonnelAction = async (action, details) => {
    try {
      await logSystemAction(action, details);
    } catch (error) {
      console.error(`Personnel action ${action} completed, but its activity log failed:`, error);
      toast.warning("The personnel change succeeded, but its activity log could not be saved.");
    }
  };

  useEffect(() => {
    let active = true;

    const verifyAdminAccess = async () => {
      const currentUser = auth.currentUser;
      const email = currentUser?.email?.trim().toLowerCase();
      if (!email) {
        router.replace("/login");
        return;
      }

      try {
        const personnelSnapshot = await getDoc(doc(db, "personnel", email));
        if (!personnelSnapshot.exists() || !["Admin", "Super Admin"].includes(personnelSnapshot.data().role)) {
          router.replace("/dashboard");
          return;
        }
        if (active) setAccessChecked(true);
      } catch (error) {
        console.error("Admin authorization check failed:", error);
        router.replace("/dashboard");
      }
    };

    verifyAdminAccess();
    return () => { active = false; };
  }, [router]);

  // Load registered personnel only after administrator role is verified
  useEffect(() => {
    if (!accessChecked) return undefined;
    const unsubscribe = onSnapshot(
      collection(db, "personnel"),
      (snapshot) => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setPersonnel(list);
      },
      (error) => {
        console.error("Personnel list could not be loaded:", error);
        toast.error("Unable to load personnel. Check your access and connection.");
      }
    );
    return () => unsubscribe();
  }, [accessChecked, toast]);

  const filteredPersonnel = useMemo(() => {
    if (!searchQuery.trim()) return personnel;
    const q = searchQuery.toLowerCase();
    return personnel.filter(
      p => p.name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q) || p.role?.toLowerCase().includes(q)
    );
  }, [personnel, searchQuery]);

  const roleCounts = useMemo(() => {
    const counts = { "Super Admin": 0, Admin: 0, "Communication Officer": 0, Responder: 0 };
    personnel.forEach(p => {
      if (counts[p.role] !== undefined) counts[p.role]++;
    });
    return counts;
  }, [personnel]);

  const handleAddPersonnel = async (e) => {
    e.preventDefault();
    if (!newMember.name.trim() || !newMember.email.trim()) {
      toast.error("Please fill in both name and email");
      return;
    }

    const docId = newMember.email.trim().toLowerCase();
    if (!assignableRoles.includes(newMember.role)) {
      toast.error("You are not allowed to assign that role");
      return;
    }
    // Check for duplicate
    const existing = personnel.find(p => p.id === docId);
    if (existing) {
      toast.error("A personnel with this email already exists");
      return;
    }

    setAddingMember(true);
    try {
      await setDoc(doc(db, "personnel", docId), {
        name: newMember.name.trim(),
        email: newMember.email.trim().toLowerCase(),
        role: newMember.role,
        registered_at: new Date().toISOString(),
      });
      await logPersonnelAction("PERSONNEL_ADDED", `Added ${newMember.name.trim()} (${docId}) as ${newMember.role}`);
      setNewMember({ name: "", email: "", role: "Responder" });
      toast.success(`${newMember.name.trim()} registered as ${newMember.role}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to register personnel");
    } finally {
      setAddingMember(false);
    }
  };

  const handleStartEdit = (person) => {
    setEditingId(person.id);
    setEditData({ name: person.name, role: person.role });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditData({ name: "", role: "" });
  };

  const handleSaveEdit = async (person) => {
    if (!editData.name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    const allowedRoles = person.role === "Super Admin"
      ? ["Super Admin"]
      : (isSuperAdmin ? ROLES : STAFF_ROLES);
    if (!allowedRoles.includes(editData.role)) {
      toast.error("You are not allowed to assign that role");
      return;
    }
    try {
      await updateDoc(doc(db, "personnel", person.id), {
        name: editData.name.trim(),
        role: editData.role,
      });
      await logPersonnelAction("PERSONNEL_UPDATED", `Updated ${person.id}: name="${editData.name.trim()}", role=${editData.role}`);
      toast.success("Personnel updated");
      setEditingId(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update personnel. Check Firestore permissions and the selected role.");
    }
  };

  const handleDeletePersonnel = async (person) => {
    if (person.role === "Super Admin" || (!isSuperAdmin && !STAFF_ROLES.includes(person.role))) {
      toast.error("You are not allowed to remove this account");
      return;
    }

    if (!window.confirm(`Remove ${person.name} (${person.email}) from KALASAG staff? They will lose dashboard access.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, "personnel", person.id));
      await logPersonnelAction("PERSONNEL_REMOVED", `Removed ${person.name} (${person.id})`);
      toast.success(`${person.name} has been removed`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove personnel");
    }
  };

  const handleSendPasswordSetup = async (person) => {
    if (!isSuperAdmin && !STAFF_ROLES.includes(person.role)) {
      toast.error("You are not allowed to send a setup email for this account");
      return;
    }
    if (!person.email) {
      toast.error("This personnel record has no email address");
      return;
    }

    setResettingEmail(person.id);
    try {
      await sendPasswordResetEmail(auth, person.email);
      toast.success(`Password setup email requested for ${person.email}. If the account exists in Firebase Authentication, its owner should receive the link.`);
    } catch (error) {
      console.error("Password setup email failed:", error);
      if (error.code === "auth/user-not-found") {
        toast.error("No Firebase Authentication account exists for this email. Create it in Firebase Console first.");
      } else if (error.code === "auth/too-many-requests") {
        toast.error("Too many requests. Wait a while before sending another setup email.");
      } else if (error.code === "auth/network-request-failed") {
        toast.error("Network error while sending the setup email. Check your connection and try again.");
      } else {
        toast.error("Unable to request the password setup email. Check the email and Firebase Auth configuration.");
      }
    } finally {
      setResettingEmail("");
    }
  };

  if (!accessChecked) {
    return <div className="login-container" id="admin-access-loading"><div className="loader"></div></div>;
  }

  return (
    <>
      <header className="header" id="admin-header">
        <div className="header-title-sec">
          <h2>Admin Controls</h2>
        </div>
        <div className="admin-header-stats">
          {isSuperAdmin && (
            <div className="stat-chip">
              <span className="stat-indicator" style={{ backgroundColor: "var(--color-red)", boxShadow: "0 0 8px var(--color-red)" }}></span>
              <span>{roleCounts["Super Admin"]} Super Admin</span>
            </div>
          )}
          <div className="stat-chip">
            <span className="stat-indicator" style={{ backgroundColor: "var(--color-green)", boxShadow: "0 0 8px var(--color-green)" }}></span>
            <span>{roleCounts.Responder} Responders</span>
          </div>
          <div className="stat-chip">
            <span className="stat-indicator" style={{ backgroundColor: "var(--color-blue)", boxShadow: "0 0 8px var(--color-blue)" }}></span>
            <span>{roleCounts["Communication Officer"]} Comm Officers</span>
          </div>
          <div className="stat-chip">
            <span className="stat-indicator" style={{ backgroundColor: "var(--color-red)", boxShadow: "0 0 8px var(--color-red)" }}></span>
            <span>{roleCounts.Admin} Admins</span>
          </div>
          <div className="stat-chip">
            <span>{personnel.length} Total Staff</span>
          </div>
        </div>
      </header>

      <div className="admin-content" id="admin-content">
        <div className="admin-panel">
          {/* Add Personnel Form */}
          <div className="admin-section-card">
            <div className="admin-section-header">
              <h3>Register New Personnel</h3>
              <span className="admin-section-badge">Add Staff</span>
            </div>
            <form onSubmit={handleAddPersonnel} className="admin-form">
              <div className="admin-form-row">
                <div className="admin-form-group">
                  <label htmlFor="new-name">Full Name</label>
                  <input
                    id="new-name"
                    type="text"
                    className="admin-input"
                    placeholder="e.g. Juan Dela Cruz"
                    value={newMember.name}
                    onChange={e => setNewMember({ ...newMember, name: e.target.value })}
                  />
                </div>
                <div className="admin-form-group">
                  <label htmlFor="new-email">Email Address</label>
                  <input
                    id="new-email"
                    type="email"
                    className="admin-input"
                    placeholder="e.g. juan@gmail.com"
                    value={newMember.email}
                    onChange={e => setNewMember({ ...newMember, email: e.target.value })}
                  />
                </div>
                <div className="admin-form-group">
                  <label htmlFor="new-role">Role</label>
                  <select
                    id="new-role"
                    className="admin-input"
                    value={newMember.role}
                    onChange={e => setNewMember({ ...newMember, role: e.target.value })}
                  >
                    {assignableRoles.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <button type="submit" className="btn btn-primary admin-add-btn" disabled={addingMember}>
                  {addingMember ? "Adding..." : "Add Personnel"}
                </button>
              </div>
            </form>
            <p className="admin-section-desc">
              Staff accounts are not created here. First add the person in Firebase Console under Authentication, then use the password setup button in this directory. No password is entered or stored in KALASAG.
            </p>
          </div>

          {/* Staff List */}
          <div className="admin-section-card admin-section-grow">
            <div className="admin-section-header">
              <h3>KALASAG Staff Directory</h3>
              <span className="admin-section-count">{filteredPersonnel.length} of {personnel.length}</span>
            </div>
            <div className="admin-search-bar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                className="admin-search-input"
                placeholder="Search by name, email, or role..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="admin-search-clear" onClick={() => setSearchQuery("")}>✕</button>
              )}
            </div>

            <div className="admin-staff-list">
              {filteredPersonnel.length === 0 ? (
                <div className="admin-empty">
                  <PersonIcon size={28} color="var(--text-muted)" />
                  <span>{searchQuery ? "No matching staff found" : "No registered staff members"}</span>
                </div>
              ) : (
                filteredPersonnel.map(p => (
                  <div key={p.id} className={`admin-staff-row ${editingId === p.id ? "editing" : ""}`}>
                    {editingId === p.id ? (
                      /* Edit Mode */
                      <>
                        <div className="admin-staff-edit-form">
                          <input
                            type="text"
                            className="admin-input admin-input-sm"
                            value={editData.name}
                            onChange={e => setEditData({ ...editData, name: e.target.value })}
                            autoFocus
                          />
                          <select
                            className="admin-input admin-input-sm"
                            value={editData.role}
                            disabled={p.role === "Super Admin"}
                            onChange={e => setEditData({ ...editData, role: e.target.value })}
                          >
                            {(p.role === "Super Admin" ? ["Super Admin"] : (isSuperAdmin ? ROLES : STAFF_ROLES))
                              .map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                        <div className="admin-staff-actions">
                          <button className="admin-action-btn save" onClick={() => handleSaveEdit(p)} title="Save">
                            ✓
                          </button>
                          <button className="admin-action-btn cancel" onClick={handleCancelEdit} title="Cancel">
                            ✕
                          </button>
                        </div>
                      </>
                    ) : (
                      /* View Mode */
                      <>
                        <div className="admin-staff-info">
                          <div className="admin-staff-avatar">
                            {p.name?.[0]?.toUpperCase() || "?"}
                          </div>
                          <div className="admin-staff-details">
                            <span className="admin-staff-name">{p.name}</span>
                            <span className="admin-staff-email">{p.email}</span>
                          </div>
                        </div>
                        <div className="admin-staff-right">
                          <span className={`badge ${ROLE_COLORS[p.role] || "badge-green"}`}>{p.role}</span>
                          <div className="admin-staff-actions">
                            {(isSuperAdmin || STAFF_ROLES.includes(p.role)) && (
                              <button
                                className="admin-action-btn edit"
                                onClick={() => handleStartEdit(p)}
                                title={p.role === "Super Admin" ? "Edit name" : "Edit"}
                                aria-label={p.role === "Super Admin" ? "Edit Super Admin name" : `Edit ${p.name}`}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                              </button>
                            )}
                            {(isSuperAdmin || STAFF_ROLES.includes(p.role)) && (
                              <button
                                className="admin-action-btn"
                                onClick={() => handleSendPasswordSetup(p)}
                                disabled={resettingEmail === p.id}
                                title="Send password setup/reset email"
                                aria-label={`Send password setup email to ${p.email}`}
                              >
                                {resettingEmail === p.id ? "…" : (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                                )}
                              </button>
                            )}
                            {p.role !== "Super Admin" && (isSuperAdmin || STAFF_ROLES.includes(p.role)) && (
                              <button
                                className="admin-action-btn delete"
                                onClick={() => handleDeletePersonnel(p)}
                                title="Remove"
                                aria-label={`Remove ${p.name}`}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
