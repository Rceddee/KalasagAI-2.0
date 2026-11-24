"use client";

import React, { useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertIcon, CheckIcon, MoonIcon, ShieldIcon, SunIcon } from "@/components/Icons";
import { useTheme } from "@/components/ThemeContext";
import { getSupabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const { error: resetError } = await getSupabase().auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/reset-password` },
      );
      if (resetError) throw resetError;
      setMessage("If an account exists for that email, a password reset link will be sent.");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to request password recovery.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-ambient-wrap">
      <div className="auth-ambient-glow-red" aria-hidden="true" />
      <div className="auth-ambient-glow-blue" aria-hidden="true" />

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
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Account Security &amp; Password Recovery
          </p>
        </div>

        <section className="auth-card-body" aria-labelledby="forgot-password-heading">
          <div>
            <h2
              id="forgot-password-heading"
              style={{ fontSize: "16px", fontWeight: 800, color: "var(--text-primary)" }}
            >
              Forgot Password?
            </h2>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
              Enter the email linked to your resident account to request a secure reset link.
            </p>
          </div>

          {error && (
            <div
              role="alert"
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
              role="status"
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

          <form
            onSubmit={(event) => void submit(event)}
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <div className="auth-input-group">
              <label className="auth-input-label" htmlFor="recovery-email">Email Address</label>
              <input
                id="recovery-email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email"
                disabled={busy}
                className="auth-input-field"
              />
            </div>
            <button type="submit" disabled={busy} className="auth-submit-btn">
              {busy ? "Sending reset link…" : "Send Reset Link"}
            </button>
          </form>

          <div className="auth-switch-link">
            Remembered your password?
            <Link href="/">Return to sign in</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
