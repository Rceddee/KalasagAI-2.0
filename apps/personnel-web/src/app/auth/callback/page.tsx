"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export default function PersonnelAuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;


    async function completeAuthentication() {
      try {
        const supabase = getSupabase();
        const callbackUrl = new URL(window.location.href);
        const code = callbackUrl.searchParams.get("code");
        const fragment = new URLSearchParams(callbackUrl.hash.slice(1));
        const accessToken = fragment.get("access_token");
        const refreshToken = fragment.get("refresh_token");
        let isRecovery = (callbackUrl.searchParams.get("type") || fragment.get("type")) === "recovery";
        if (!code && !(accessToken && refreshToken)) {
          throw new Error("The authentication link is invalid or expired. Request a new one.");
        }

        window.history.replaceState(window.history.state, "", callbackUrl.pathname);

        if (code) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          isRecovery ||= "redirectType" in data && data.redirectType === "recovery";
        } else if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session) {
          throw new Error("The authentication link is invalid or expired. Request a new one.");
        }

        if (active) {
          if (isRecovery) {
            router.replace("/reset-password");
          } else {
            router.replace("/dashboard");
          }
        }
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Unable to complete authentication.");
        }
      }
    }

    // Strict Mode can restart the effect before the one-time code is consumed.
    queueMicrotask(() => { if (active) void completeAuthentication(); });
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="personnel-login">
      <section className="login-panel" aria-labelledby="callback-heading">
        <Link className="dashboard-brand" href="/login">
          <span className="shield-mark">K</span>
          <span>KALASAG<span>AI</span><small>OPERATIONS</small></span>
        </Link>
        <p className="eyebrow">PERSONNEL ACCESS</p>
        <h1 id="callback-heading">Completing secure sign-in</h1>
        {!error && <p className="muted" role="status">Validating your authentication link…</p>}
        {error && <p className="ops-error" role="alert">{error}</p>}
        {error && <Link href="/forgot-password">Request another password link</Link>}
      </section>
    </main>
  );
}
