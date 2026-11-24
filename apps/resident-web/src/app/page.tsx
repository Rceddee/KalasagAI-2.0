"use client";

import React, { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useResidentAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeContext";
import { getSupabase } from "@/lib/supabase";
import {
  ShieldIcon,
  AlertIcon,
  SunIcon,
  MoonIcon,
} from "@/components/Icons";

export default function SignInPage() {
  const router = useRouter();
  const { user, loading } = useResidentAuth();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user) {
      router.replace("/report");
    }
  }, [loading, router, user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError("Please enter both email and password.");
      setBusy(false);
      return;
    }

    try {
      const { error: signInError } = await getSupabase().auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (signInError) throw signInError;
      router.replace("/report");
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "Failed to sign in. Please try again.";
      if (msg.includes("Invalid login credentials")) {
        setError("Invalid email or password. Please try again.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="auth-ambient-wrap">
        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Connecting to KALASAG AI…</p>
      </main>
    );
  }

  return (
    <main className="auth-ambient-wrap">
      {/* Ambient background glows matching mobile */}
      <div className="auth-ambient-glow-red" />
      <div className="auth-ambient-glow-blue" />

      <div className="auth-card-wrap">
        {/* Top bar with Theme Switcher */}
        <div className="auth-top-nav">
          <div
            style={{
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "0.8px",
              color: "var(--text-muted)",
              textTransform: "uppercase",
            }}
          >
            MDRRMO GUMACA
          </div>

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
            Citizen Emergency Portal
          </p>
        </div>

        {/* Main Sign In Card */}
        <div className="auth-card-body">
          <div>
            <h2
              style={{
                fontSize: "16px",
                fontWeight: 800,
                color: "var(--text-primary)",
              }}
            >
              Sign In
            </h2>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                marginTop: "2px",
              }}
            >
              Sign in with your registered account to report emergencies.
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

          {/* Email / Password Form */}
          <form
            onSubmit={(event) => void submit(event)}
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <div className="auth-input-group">
              <label className="auth-input-label">Email Address</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                disabled={busy}
                className="auth-input-field"
              />
            </div>

            <div className="auth-input-group">
              <label className="auth-input-label">Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={busy}
                className="auth-input-field"
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Link
                href="/forgot-password"
                style={{
                  color: "var(--color-blue)",
                  fontSize: "11px",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Forgot Password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="auth-submit-btn"
            >
              {busy ? "Signing In…" : "Sign In"}
            </button>
          </form>

          {/* Switch link */}
          <div className="auth-switch-link">
            Don&apos;t have an account?
            <Link href="/register">Create resident account</Link>
          </div>
        </div>

        {/* Advisory Footnote */}
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
    </main>
  );
}
