import { createClient } from "@supabase/supabase-js";

export function getPasswordRecoveryRedirectUrl(origin: string): string {
  return new URL("/auth/callback?type=recovery", origin).toString();
}

// A staff member opens this link in a different browser from the administrator.
export function sendStaffRecoveryEmail(email: string, origin: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Personnel password recovery is unavailable.");
  const sender = createClient(url, key, {
    auth: {
      flowType: "implicit",
      storageKey: "personnel-recovery-sender",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return sender.auth.resetPasswordForEmail(email, { redirectTo: getPasswordRecoveryRedirectUrl(origin) });
}
