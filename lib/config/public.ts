const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const publicConfig = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL?.trim(),
  supabase: {
    url: supabaseUrl,
    publishableKey: supabasePublishableKey,
  },
} as const;
