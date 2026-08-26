import { publicConfig } from "@/lib/config/public";

export function getSupabaseConfig() {
  const { url: supabaseUrl, publishableKey: supabasePublishableKey } =
    publicConfig.supabase;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Supabase Auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return { supabaseUrl, supabasePublishableKey };
}

export function hasSupabaseConfig() {
  return Boolean(
    publicConfig.supabase.url && publicConfig.supabase.publishableKey,
  );
}
