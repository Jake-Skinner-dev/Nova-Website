import { createClient } from "@supabase/supabase-js";

// Nova Brief reuses the same Supabase project as the parent Nova Social
// site. The anon key is a public key by design — every brief_* table it
// can touch is protected by Row Level Security (see
// brief/brief-supabase-setup.sql): the public can only ever read rows
// where status = 'published'; only the signed-in editor account can write;
// anonymous visitors can INSERT into brief_subscribers (newsletter) and
// nothing else.
const SUPABASE_URL = "https://whtsdbhnnwxgqfubkmxp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodHNkYmhubnd4Z3FmdWJrbXhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzcwMDUsImV4cCI6MjEwMjgxMzAwNX0.LnH5rJzxiaxjQjrC3PcnkQ-UA0KP0feGYdI0WqiOeXY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});
