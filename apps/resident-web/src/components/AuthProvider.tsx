"use client";

import {
  Fragment,
  useRef,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isAuthSessionMissingError, type User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { isInvalidAuthSessionError } from "@/lib/auth-session";
import type { ResidentProfile } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  profile: ResidentProfile | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  error: null,
  refreshProfile: async () => { throw new Error("Resident authentication is unavailable."); },
  signOut: async () => { throw new Error("Resident authentication is unavailable."); },
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const configuration = useMemo(() => {
    try {
      return { supabase: getSupabase(), error: null };
    } catch (reason) {
      return {
        supabase: null,
        error: reason instanceof Error ? reason.message : "Supabase is not configured.",
      };
    }
  }, []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ResidentProfile | null>(null);
  const [loading, setLoading] = useState(configuration.supabase !== null);
  const [error, setError] = useState<string | null>(null);

  const currentUserId = useRef<string | null>(null);
  const profileVersion = useRef(0);

  const loadProfile = useCallback(async (userId: string) => {
    const supabase = configuration.supabase;
    if (!supabase) throw new Error(configuration.error ?? "Supabase is not configured.");
    const version = ++profileVersion.current;
    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, email, contact_number, role")
      .eq("id", userId)
      .single();
    if (currentUserId.current !== userId || version !== profileVersion.current) return;
    if (profileError) {
      setError("Unable to load your resident profile. Please retry.");
      throw profileError;
    }
    setProfile(data as ResidentProfile);
    setError(null);
  }, [configuration]);

  useEffect(() => {
    const supabase = configuration.supabase;
    if (!supabase) return;
    let active = true;
    let authEventSeen = false;

    const applyUser = (nextUser: User | null) => {
      if (!active) return;
      const isNewUser = currentUserId.current !== (nextUser?.id ?? null);
      if (isNewUser) {
        setProfile(null);
        currentUserId.current = nextUser?.id ?? null;
      }
      setError(null);
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setLoading(false);
        return;
      }
      if (isNewUser) {
        setLoading(true);
      }
      void loadProfile(nextUser.id).catch(() => undefined).finally(() => {
        if (active && currentUserId.current === nextUser.id) setLoading(false);
      });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!["SIGNED_OUT", "SIGNED_IN", "USER_UPDATED", "PASSWORD_RECOVERY"].includes(event)) return;
      authEventSeen = true;
      if (event === "SIGNED_OUT") {
        applyUser(null);
      } else {
        applyUser(session?.user ?? null);
      }
    });

    void supabase.auth.getUser().then(async ({ data, error: authError }) => {
      if (!active || authEventSeen) return;
      if (authError) {
        if (isAuthSessionMissingError(authError)) {
          applyUser(null);
        } else if (isInvalidAuthSessionError(authError)) {
          const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
          if (signOutError) {
            console.warn("Could not revoke the invalid resident session remotely:", signOutError);
          }
          if (active && !authEventSeen) {
            setUser(null);
            setProfile(null);
            setError(null);
          }
        } else {
          if (active) {
            setUser(null);
            setProfile(null);
            setError("Unable to restore your session. Check your connection and retry.");
          }
        }
        setLoading(false);
      } else {
        applyUser(data.user);
      }
    }).catch(() => {
      if (!active || authEventSeen) return;
      setUser(null);
      setProfile(null);
      setError("Unable to restore your session. Check your connection and retry.");
      setLoading(false);
    });

    const currentProfileVersion = profileVersion;
    return () => {
      active = false;
      currentProfileVersion.current++;
      subscription.unsubscribe();
    };
  }, [configuration.supabase, loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (!user) throw new Error("Sign in to load your resident profile.");
    await loadProfile(user.id);
  }, [loadProfile, user]);

  const signOut = useCallback(async () => {
    const supabase = configuration.supabase;
    if (!supabase) throw new Error(configuration.error ?? "Supabase is not configured.");
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
    setUser(null);
    setProfile(null);
  }, [configuration]);

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading: configuration.supabase ? loading : false,
      error: configuration.error ?? error,
      refreshProfile,
      signOut,
    }}>
      <Fragment key={user?.id ?? "signed-out"}>{children}</Fragment>
    </AuthContext.Provider>
  );
}

export function useResidentAuth(): AuthContextValue {
  return useContext(AuthContext);
}
