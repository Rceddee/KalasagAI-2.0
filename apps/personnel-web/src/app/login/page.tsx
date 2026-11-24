"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldIcon, AlertIcon, SunIcon, MoonIcon } from "@/components/Icons";
import { useTheme } from "@/components/ThemeContext";
import { getSupabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    // Check if user is already authenticated
    const checkSession = async () => {
      const { data: { session } } = await getSupabase().auth.getSession();
      if (session) {
        router.replace("/dashboard");
      }
    };
    void checkSession();
  }, [router]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setSigningIn(true);
    setError("");

    try {
      const { error: signInError } = await getSupabase().auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        setError(signInError.message || "Invalid email or password. Please check your credentials.");
        setSigningIn(false);
        return;
      }

      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      setSigningIn(false);
    }
  };

  return (
    <div className="login-container" id="login-screen">
      <div className="glow-circle glow-red"></div>
      <button
        className="login-theme-toggle"
        onClick={toggleTheme}
        type="button"
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
      >
        {theme === "dark" ? (
          <SunIcon size={17} color="var(--color-yellow)" />
        ) : (
          <MoonIcon size={17} color="var(--color-blue)" />
        )}
        <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
      </button>
      <div className="glow-circle glow-blue"></div>

      <div className="login-card" id="auth-login-card">
        <div className="logo-header">
          <div className="shield-icon">
            <ShieldIcon size={48} color="var(--color-red)" />
          </div>
          <h1 id="app-heading">KALASAG AI</h1>
          <p className="subtitle">Gumaca Incident Management Portal</p>
        </div>
        <div className="divider"></div>
        <p className="card-description login-access-note">
          Authorized staff only. Accounts are created by an administrator; public sign-up is disabled.
        </p>

        {error && (
          <div
            className="error-message"
            id="login-error-alert"
            role="alert"
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <AlertIcon size={16} color="var(--text-danger)" />
            <span>{error}</span>
          </div>
        )}

        <form
          className="login-form"
          onSubmit={handleEmailLogin}
          id="email-login-form"
        >
          <input
            type="email"
            className="login-input"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={signingIn}
            id="login-email-input"
            autoComplete="email"
            required
          />
          <input
            type="password"
            className="login-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={signingIn}
            id="login-password-input"
            autoComplete="current-password"
            required
          />
          <button
            type="submit"
            className="btn btn-primary"
            id="email-signin-btn"
            disabled={signingIn}
          >
            {signingIn ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div style={{ marginTop: "16px", textAlign: "center" }}>
          <Link href="/forgot-password" style={{ color: "var(--text-secondary)", fontSize: "14px", textDecoration: "underline" }}>
            Forgot password?
          </Link>
        </div>

      </div>
    </div>
  );
}
