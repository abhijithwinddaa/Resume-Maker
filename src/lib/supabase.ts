import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let accessTokenGetter: (() => Promise<string | null>) | null = null;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables",
  );
}

export function setSupabaseAccessTokenGetter(
  getter: (() => Promise<string | null>) | null,
): void {
  accessTokenGetter = getter;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  accessToken: async () => {
    if (!accessTokenGetter) return null;
    try {
      return await accessTokenGetter();
    } catch {
      return null;
    }
  },
});
