import { createClient } from "@supabase/supabase-js";

type EnvMap = Record<string, string | undefined>;

function getEnvMap(): EnvMap {
  return (
    (
      globalThis as typeof globalThis & {
        process?: { env?: EnvMap };
      }
    ).process?.env || {}
  );
}

function readEnv(...keys: string[]): string {
  const env = getEnvMap();
  for (const key of keys) {
    const value = env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function getSupabaseAdminClient() {
  const supabaseUrl = readEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
