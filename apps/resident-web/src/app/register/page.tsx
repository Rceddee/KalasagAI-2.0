"use client";

import React, { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { normalizePhilippineMobile } from "@kalasag/shared-validation";
import { useResidentAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeContext";
import { getSupabase } from "@/lib/supabase";
import {
  ShieldIcon,
  AlertIcon,
  CheckIcon,
  CloseIcon,
  SunIcon,
  MoonIcon,
} from "@/components/Icons";

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading } = useResidentAuth();
  const { theme, toggleTheme } = useTheme();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!loading && user) {
      router.replace("/report");
    }
  }, [loading, router, user]);

  if (loading || user) {
    return (
      <main className="auth-ambient-wrap">
        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Connecting to KALASAG AI…</p>
      </main>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!termsAgreed) {
      setError("Please review and accept the Terms & Anti-False Reporting Agreement before creating an account.");
      return;
    }

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError("Please enter your full name.");
      return;
    }

    const phone = normalizePhilippineMobile(contactNumber);
    if (!phone) {
      setError("Please enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).");
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmation) {
      setError("Passwords do not match. Please re-type your password confirmation.");
      return;
    }

    setBusy(true);
    try {
      const { data, error: signUpError } = await getSupabase().auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: trimmedName,
            contact_number: phone,
          },
        },
      });

      if (signUpError) throw signUpError;

      if (data.session) {
        router.replace("/report");
      } else {
        setMessage(
          "Registration received! Please check your email inbox for a verification link before signing in."
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Registration failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-ambient-wrap">
      {/* Ambient background glows */}
      <div className="auth-ambient-glow-red" />
      <div className="auth-ambient-glow-blue" />

      <div className="auth-card-wrap">
        {/* Top Bar */}
        <div className="auth-top-nav">
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 12px",
              borderRadius: "999px",
              background: "var(--glass-bg)",
              border: "1px solid var(--glass-border)",
              color: "var(--text-secondary)",
              fontSize: "11px",
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            ← SIGN IN
          </Link>

          <button
            onClick={toggleTheme}
            type="button"
            className="theme-toggle-btn"
            aria-label="Toggle dark/light theme"
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
        </div>

        {/* Brand Section */}
        <div className="auth-brand-center">
          <div className="auth-brand-logo">
            <ShieldIcon size={32} color="var(--color-red)" />
          </div>
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 800,
              letterSpacing: "0.5px",
              color: "var(--text-primary)",
            }}
          >
            KALASAG AI
          </h1>
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-secondary)",
              marginTop: "4px",
            }}
          >
            Citizen Emergency Registration
          </p>
        </div>

        {/* Registration Card */}
        <div className="auth-card-body">
          <div>
            <h2
              style={{
                fontSize: "16px",
                fontWeight: 800,
                color: "var(--text-primary)",
              }}
            >
              Create Account
            </h2>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                marginTop: "2px",
              }}
            >
              Register with your verified Philippine contact details.
            </p>
          </div>

          {/* Feedback Banners */}
          {error && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "var(--color-red-glow)",
                border: "1px solid var(--color-red)",
                color: "var(--text-danger)",
                padding: "10px 14px",
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
                padding: "10px 14px",
                borderRadius: "10px",
                fontSize: "12px",
              }}
            >
              <CheckIcon size={16} color="var(--color-green)" />
              <span>{message}</span>
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={(event) => void submit(event)}
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <div className="auth-input-group">
              <label className="auth-input-label">Full Name *</label>
              <input
                type="text"
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Juan Dela Cruz"
                disabled={busy}
                className="auth-input-field"
              />
            </div>

            <div className="auth-input-group">
              <label className="auth-input-label">Contact Number (PH Mobile) *</label>
              <input
                type="tel"
                required
                autoComplete="tel"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="09171234567 or +639171234567"
                disabled={busy}
                className="auth-input-field"
              />
            </div>

            <div className="auth-input-group">
              <label className="auth-input-label">Email Address *</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="juan@gmail.com"
                disabled={busy}
                className="auth-input-field"
              />
            </div>

            <div className="auth-input-group">
              <label className="auth-input-label">Password * (Min. 8 chars)</label>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                disabled={busy}
                className="auth-input-field"
              />
            </div>

            <div className="auth-input-group">
              <label className="auth-input-label">Confirm Password *</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="Re-enter password"
                disabled={busy}
                className="auth-input-field"
              />
            </div>

            {/* Anti-Spam & Terms Agreement */}
            <div className="auth-terms-box">
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  cursor: "pointer",
                  fontSize: "11px",
                  lineHeight: 1.5,
                  color: "var(--text-secondary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={termsAgreed}
                  onChange={(e) => setTermsAgreed(e.target.checked)}
                  style={{
                    marginTop: "2px",
                    accentColor: "var(--color-blue)",
                    width: "16px",
                    height: "16px",
                    flexShrink: 0,
                  }}
                />
                <span>
                  I agree to the{" "}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowTermsModal(true);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--color-blue)",
                      fontWeight: 800,
                      padding: 0,
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Terms &amp; Anti-False Reporting Policy
                  </button>{" "}
                  and acknowledge that prank or false emergency calls are strictly prohibited under RA 10639 &amp; PD 1727.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="auth-submit-btn"
            >
              {busy ? "Creating Account…" : "Create Account"}
            </button>
          </form>

          {/* Switch to Sign In */}
          <div className="auth-switch-link">
            Already registered?
            <Link href="/">Sign In</Link>
          </div>
        </div>

        {/* Footnote */}
        <p
          style={{
            textAlign: "center",
            fontSize: "11px",
            color: "var(--text-muted)",
            marginTop: "20px",
            lineHeight: 1.5,
          }}
        >
          Authorized Emergency Management System<br />
          Municipality of Gumaca, Quezon
        </p>
      </div>

      {/* Terms & Penalties Modal */}
      {showTermsModal && (
        <div className="resident-modal-backdrop" onClick={() => setShowTermsModal(false)}>
          <div
            className="resident-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "80vh", overflowY: "auto" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "16px",
                borderBottom: "1px solid var(--glass-border)",
                paddingBottom: "12px",
              }}
            >
              <h3 style={{ fontSize: "15px", fontWeight: 800, color: "var(--text-primary)" }}>
                Terms &amp; Penalties Policy
              </h3>
              <button
                onClick={() => setShowTermsModal(false)}
                type="button"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                <CloseIcon size={20} />
              </button>
            </div>

            <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: "12px" }}>
              <p>
                <strong>1. Purpose of KALASAG AI:</strong> The platform is designed solely to expedite emergency disaster response, medical dispatches, fire alarms, and public safety coordination for the Municipality of Gumaca, Quezon.
              </p>
              <p>
                <strong>2. Republic Act 10639 (The Free Mobile Disaster Alerts Act):</strong> Emergency alerting systems are protected under national telecommunication statutes. Misuse of emergency channels impedes first responders.
              </p>
              <p>
                <strong>3. Presidential Decree No. 1727 &amp; False Alarm Penalties:</strong> Submitting malicious, prank, or fraudulent emergency reports is a criminal offense punishable by fines and imprisonment under Philippine law. Your registered device IP and phone number are permanently logged with each report.
              </p>
              <p>
                <strong>4. Data Privacy Act of 2012 (RA 10173):</strong> Your contact information is stored strictly for incident verification and communication with MDRRMO Gumaca personnel. It is never sold or shared with commercial entities.
              </p>
            </div>

            <button
              onClick={() => {
                setTermsAgreed(true);
                setShowTermsModal(false);
              }}
              type="button"
              className="btn-submit-emergency"
              style={{ width: "100%", marginTop: "16px", padding: "12px" }}
            >
              I Understand and Accept
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
