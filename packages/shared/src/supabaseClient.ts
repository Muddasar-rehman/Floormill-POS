import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export function createSupabaseClient(env: SupabaseEnv): SupabaseClient {
  if (!env.url || !env.anonKey) {
    throw new Error(
      "Missing Supabase URL or anon key. Set them in your app's .env file."
    );
  }
  return createClient(env.url, env.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
