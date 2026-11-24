"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";

export default function PersonnelResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function validateRecoverySession() {
      try {
        const { data, error: sessionError } = await getSupabase().auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session) {
          throw new Error("The password setup link is invalid or expired. Request a new one.");
        }
        if (active) setReady(true);
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Unable to validate the password setup link.");
        }
      }
    }

    void validateRecoverySession();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 8 || password !== confirmPassword) {
      setError("Use a password of at least 8 characters and enter it the same way twice.");
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabase();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        throw new Error(`Password updated, but the recovery session could not be cleared: ${signOutError.message}`);
      }
      setReady(false);
      setMessage("Password set. You can now sign in to Personnel Web.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to set the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="personnel-login">
      <section className="login-panel" aria-labelledby="reset-heading">
        <Link className="dashboard-brand" href="/login">
          <span className="shield-mark">K</span>
          <span>KALASAG<span>AI</span><small>OPERATIONS</small></span>
        </Link>
        <p className="eyebrow">PERSONNEL ACCESS</p>
        <h1 id="reset-heading">Set your password</h1>
        {!ready && !error && <p className="muted" role="status">Validating your recovery link…</p>}
        {ready && (
          <form className="ops-form" onSubmit={(event) => void submit(event)}>
            <label>
              New password
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <label>
              Confirm password
              <input
                autoComplete="new-password"
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </label>
            <button className="ops-primary" disabled={busy} type="submit">
              {busy ? "Saving…" : "Set password"}
            </button>
          </form>
        )}
        {error && <p className="ops-error" role="alert">{error}</p>}
        {message && <p className="muted" role="status">{message}</p>}
        <Link href="/login">Return to sign in</Link>
      </section>
    </main>
  );
}
