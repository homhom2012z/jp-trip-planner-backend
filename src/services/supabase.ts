import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "../config";

if (!CONFIG.SUPABASE.URL || !CONFIG.SUPABASE.SERVICE_KEY) {
  console.error("Supabase credentials missing. Client cannot be initialized.");
}

// Service Role Client - Has FULL ACCESS to the DB. Use with caution.
// We need this to read encrypted tokens and manage permissions that RLS might hide.
export const supabaseAdmin = createClient(
  CONFIG.SUPABASE.URL,
  CONFIG.SUPABASE.SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Helper to check connection/health
export async function checkSupabaseConnection() {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("count", { count: "exact", head: true });
    if (error) throw error;
    console.log("[Supabase] Connection verified.");
    return true;
  } catch (error) {
    console.error("[Supabase] Connection failed:", error);
    return false;
  }
}
