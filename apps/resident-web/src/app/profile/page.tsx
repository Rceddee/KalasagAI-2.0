"use client";

import React, { useState, type FormEvent } from "react";
import { normalizePhilippineMobile } from "@kalasag/shared-validation";
import { ResidentShell } from "@/components/ResidentShell";
import { useResidentAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase";
import { CheckIcon, AlertIcon } from "@/components/Icons";

export default function ProfilePage() {
  const { user, profile, refreshProfile, signOut } = useResidentAuth();
  const [editedFullName, setEditedFullName] = useState<string | null>(null);
  const [editedContactNumber, setEditedContactNumber] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const fullName = editedFullName ?? profile?.full_name ?? "";
  const contactNumber = editedContactNumber ?? profile?.contact_number ?? "";

  const initials = (fullName || user?.email || "C")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!user) return;

    const normalized = normalizePhilippineMobile(contactNumber);
    if (!normalized) {
      setError("Please enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).");
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await getSupabase()
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          contact_number: normalized,
        })
        .eq("id", user.id);

      if (updateError) throw updateError;
      await refreshProfile();
      setEditedFullName(null);
      setEditedContactNumber(null);
      setMessage("Profile successfully updated. New contact details will apply to your next incident submissions.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to update profile. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResidentShell>
      <div style={{ padding: "16px 16px 32px", maxWidth: "560px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <h1
            style={{
              fontSize: "18px",
              fontWeight: 800,
              letterSpacing: "0.8px",
              color: "var(--text-primary)",
              textTransform: "uppercase",
            }}
          >
            Citizen Profile
          </h1>
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              marginTop: "4px",
            }}
          >
            KalasagAI Emergency Responder Identity
          </p>
        </div>

        {/* Profile Card Summary */}
        <div
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--glass-border)",
            borderRadius: "16px",
            padding: "20px",
            marginBottom: "20px",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "var(--color-blue-glow)",
              border: "2px solid var(--color-blue)",
              color: "var(--color-blue)",
              display: "grid",
              placeItems: "center",
              fontSize: "20px",
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 800,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {fullName || "Citizen Reporter"}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                marginTop: "2px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.email}
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                marginTop: "6px",
                background: "var(--color-green-glow)",
                border: "1px solid var(--color-green)",
                color: "var(--text-success)",
                padding: "2px 8px",
                borderRadius: "6px",
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: "0.5px",
              }}
            >
              <CheckIcon size={12} color="var(--color-green)" />
              <span>VERIFIED CITIZEN</span>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <div
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--glass-border)",
            borderRadius: "16px",
            padding: "20px",
            boxShadow: "var(--shadow-sm)",
            marginBottom: "20px",
          }}
        >
          <h2
            style={{
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "0.8px",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              marginBottom: "16px",
            }}
          >
            Personal Information
          </h2>

          <form onSubmit={(event) => void submit(event)} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  marginBottom: "6px",
                }}
              >
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setEditedFullName(e.target.value)}
                maxLength={120}
                required
                style={{
                  width: "100%",
                  background: "var(--bg-primary)",
                  border: "1px solid var(--glass-border)",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  outline: "none",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  marginBottom: "6px",
                }}
              >
                Email Address
              </label>
              <input
                type="email"
                value={profile?.email ?? user?.email ?? ""}
                readOnly
                disabled
                style={{
                  width: "100%",
                  background: "var(--bg-primary)",
                  border: "1px solid var(--glass-border)",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  color: "var(--text-muted)",
                  fontSize: "13px",
                  cursor: "not-allowed",
                  opacity: 0.7,
                }}
              />
              <span style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                Email is tied to your authentication account and cannot be changed here.
              </span>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  marginBottom: "6px",
                }}
              >
                Contact Number
              </label>
              <input
                type="tel"
                value={contactNumber}
                onChange={(e) => setEditedContactNumber(e.target.value)}
                placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                required
                style={{
                  width: "100%",
                  background: "var(--bg-primary)",
                  border: "1px solid var(--glass-border)",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  outline: "none",
                }}
              />
              <span style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                MDRRMO Gumaca may use this number to contact you about your reports.
              </span>
            </div>

            {error && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "var(--color-red-glow)",
                  border: "1px solid var(--color-red)",
                  color: "var(--text-danger)",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  fontSize: "12px",
                }}
              >
                <AlertIcon size={16} color="var(--color-red)" />
                <span>{error}</span>
              </div>
            )}

            {message && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "var(--color-green-glow)",
                  border: "1px solid var(--color-green)",
                  color: "var(--text-success)",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  fontSize: "12px",
                }}
              >
                <CheckIcon size={16} color="var(--color-green)" />
                <span>{message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{
                marginTop: "6px",
                background: busy ? "var(--text-muted)" : "var(--color-blue)",
                color: "#fff",
                border: "none",
                padding: "12px",
                borderRadius: "10px",
                fontSize: "13px",
                fontWeight: 800,
                cursor: busy ? "not-allowed" : "pointer",
                boxShadow: "0 2px 8px var(--color-blue-glow)",
              }}
            >
              {busy ? "Saving Changes…" : "Save Profile Details"}
            </button>
          </form>
        </div>

        {/* Sign Out Card */}
        <div
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--glass-border)",
            borderRadius: "16px",
            padding: "16px",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
              Sign Out of Device
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
              Ends your active resident session on this browser
            </div>
          </div>
          <button
            onClick={() => {
              if (window.confirm("Are you sure you want to sign out of KALASAG AI?")) {
                void signOut();
              }
            }}
            type="button"
            style={{
              background: "transparent",
              border: "1px solid var(--color-red)",
              color: "var(--color-red)",
              fontSize: "12px",
              fontWeight: 800,
              padding: "8px 16px",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </ResidentShell>
  );
}
