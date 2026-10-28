import { createClient } from '@supabase/supabase-js';

const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ssgbabvtmijhkrqgyrmp.supabase.co';
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_GdSS1_BZfcPiM4LijEmiWQ_eotgebIP';

export const supabase = createClient(publicUrl, publicKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
