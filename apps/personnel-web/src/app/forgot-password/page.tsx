"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AlertIcon, MoonIcon, ShieldIcon, SunIcon } from "@/components/Icons";
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
      const { error: recoveryError } = await getSupabase().auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/auth/callback?type=recovery` },
      );
      if (recoveryError) throw recoveryError;
      setMessage("If an account exists for that email, a password setup link will be sent.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to request password recovery.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-container">
      <div className="glow-circle glow-red" aria-hidden="true" />
      <button
        className="login-theme-toggle"
        onClick={toggleTheme}
        type="button"
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
      >
        {theme === "dark"
          ? <SunIcon size={17} color="var(--color-yellow)" />
          : <MoonIcon size={17} color="var(--color-blue)" />}
        <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
      </button>
      <div className="glow-circle glow-blue" aria-hidden="true" />

      <section className="login-card" aria-labelledby="recovery-heading">
        <div className="logo-header">
          <div className="shield-icon">
            <ShieldIcon size={48} color="var(--color-red)" />
          </div>
          <h1 id="recovery-heading">KALASAG AI</h1>
          <p className="subtitle">Gumaca Incident Management Portal</p>
        </div>
        <div className="divider" />
        <h2 style={{ fontSize: "18px", marginBottom: "8px", textAlign: "center" }}>
          Reset your password
        </h2>
        <p className="card-description" style={{ marginBottom: "22px" }}>
          Enter your staff account email. If an account exists, we’ll send a secure password setup link.
        </p>

        {error && (
          <div className="error-message" role="alert" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertIcon size={16} color="var(--text-danger)" />
            <span>{error}</span>
          </div>
        )}
        {message && (
          <p role="status" style={{ width: "100%", color: "var(--color-green)", fontSize: "13px", lineHeight: 1.5 }}>
            {message}
          </p>
        )}

        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <input
            id="recovery-email"
            className="login-input"
            aria-label="Email address"
            autoComplete="email"
            autoFocus
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email address"
            required
            type="email"
            value={email}
            disabled={busy}
          />
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? "Sending…" : "Send password link"}
          </button>
        </form>
        <Link
          href="/login"
          style={{ marginTop: "20px", color: "var(--text-secondary)", fontSize: "12px", textDecoration: "underline" }}
        >
          Return to sign in
        </Link>
      </section>
    </main>
  );
}
