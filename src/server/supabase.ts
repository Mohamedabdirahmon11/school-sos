/** Server-only Supabase client. A service-role key is mandatory; the anon key is not used here. */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const rawUrl = process.env.SUPABASE_URL || '';
export const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
export const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey && supabaseUrl.startsWith('https://'));

export let supabase: SupabaseClient | null = null;
if (isSupabaseConfigured) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  } catch {
    supabase = null;
  }
}
