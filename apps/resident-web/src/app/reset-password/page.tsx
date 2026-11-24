"use client";

import React, { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeContext";
import { getSupabase } from "@/lib/supabase";
import {
  ShieldIcon,
  AlertIcon,
  CheckIcon,
  SunIcon,
  MoonIcon,
} from "@/components/Icons";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;
    // The resident browser client exchanges recovery codes during initialization.
    async function validateSession() {
      const { error: initializationError } = await supabase.auth.initialize();
      if (initializationError) throw initializationError;
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) throw new Error("Missing recovery session");
      if (active) setReady(true);
    }
    void validateSession().catch(() => {
      if (active) setError("The password reset link is invalid or has expired. Please request a new link.");
    });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 8) {
      setError("Please use a password with at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match. Please verify your new password.");
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await getSupabase().auth.updateUser({ password });
      if (updateError) throw updateError;

      const { error: signOutError } = await getSupabase().auth.signOut();
      if (signOutError) throw new Error("Password updated. Please sign out to end your recovery session.");
      setMessage("Password successfully updated. You may now sign in with your new password.");
      setTimeout(() => {
        router.replace("/");
      }, 2000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to update password. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-ambient-wrap">
      <div className="auth-ambient-glow-red" />
      <div className="auth-ambient-glow-blue" />

      <div className="auth-card-wrap">
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
            ← BACK TO SIGN IN
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
            Account Security &amp; Password Reset
          </p>
        </div>

        <div className="auth-card-body">
          <div>
            <h2
              style={{
                fontSize: "16px",
                fontWeight: 800,
                color: "var(--text-primary)",
              }}
            >
              Choose New Password
            </h2>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                marginTop: "2px",
              }}
            >
              Create a strong password of at least 8 characters.
            </p>
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

          {!ready && !error ? (
            <p style={{ fontSize: "13px", color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>
              Validating your secure password recovery link…
            </p>
          ) : (
            <form
              onSubmit={(event) => void submit(event)}
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <div className="auth-input-group">
                <label className="auth-input-label">New Password *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  disabled={!ready || busy}
                  className="auth-input-field"
                />
              </div>

              <div className="auth-input-group">
                <label className="auth-input-label">Confirm New Password *</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-type new password"
                  disabled={!ready || busy}
                  className="auth-input-field"
                />
              </div>

              <button
                type="submit"
                disabled={!ready || busy}
                className="auth-submit-btn"
              >
                {busy ? "Updating Password…" : "Update Password"}
              </button>
            </form>
          )}

          <div className="auth-switch-link">
            <Link href="/">Return to sign in</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
