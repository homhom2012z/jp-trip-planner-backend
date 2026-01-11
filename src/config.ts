import dotenv from "dotenv";

dotenv.config();

export const CONFIG = {
  PORT: process.env.PORT || 4000,
  SUPABASE: {
    URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || "", // Required for Admin access
    ANON_KEY:
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  },
  GOOGLE: {
    CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
    CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
    REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || "",
    MAPS_KEY:
      process.env.GOOGLE_MAPS_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
      "",
  },
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "", // 32-char hex string
};

// Simple validation
const missing = [];
if (!CONFIG.SUPABASE.URL) missing.push("SUPABASE_URL");
if (!CONFIG.SUPABASE.SERVICE_KEY) missing.push("SUPABASE_SERVICE_KEY");
// Anon key is optional for backend if we use service key mostly

if (missing.length > 0) {
  console.warn(`[Config] Missing environment variables: ${missing.join(", ")}`);
}
