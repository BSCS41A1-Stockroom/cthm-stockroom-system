import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { AuthContext } from "./useAuth";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let profileChannel = null;
    let sessionGeneration = 0;
    async function loadProfile(user, generation = sessionGeneration) {
      if (!user || !active) { setProfile(null); return; }
      const { data } = await supabase.from("profiles").select("user_id, role, full_name, student_id, is_active").eq("user_id", user.id).maybeSingle();
      if (!active || generation !== sessionGeneration) return;
      setProfile(data ?? null);
      if (data?.is_active === false) await supabase.auth.signOut();
    }
    async function applySession(nextSession) {
      if (!active) return;
      const generation = ++sessionGeneration;
      setSession(nextSession); setProfile(null);
      if (profileChannel) await supabase.removeChannel(profileChannel);
      if (!active || generation !== sessionGeneration) return;
      if (nextSession?.user) {
        await loadProfile(nextSession.user, generation);
        if (!active || generation !== sessionGeneration) return;
        profileChannel = supabase.channel(`own-profile-${nextSession.user.id}`)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${nextSession.user.id}` }, () => loadProfile(nextSession.user, generation)).subscribe();
      }
      if (active) setLoading(false);
    }
    supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => applySession(nextSession));
    return () => { active = false; sessionGeneration += 1; listener.subscription.unsubscribe(); if (profileChannel) supabase.removeChannel(profileChannel); };
  }, []);

  const value = useMemo(() => ({ session, user: session?.user ?? null, profile, loading,
    signOut: () => supabase.auth.signOut() }), [session, profile, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
