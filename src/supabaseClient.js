import { createClient } from "@supabase/supabase-js";

// The anon key is safe to ship in client code — it's a public key by
// design, and every table it can touch is protected by Row Level
// Security policies (see supabase-setup.sql): anyone can read, only a
// signed-in user (the one admin account) can write.
const SUPABASE_URL = "https://whtsdbhnnwxgqfubkmxp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodHNkYmhubnd4Z3FmdWJrbXhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzcwMDUsImV4cCI6MjEwMjgxMzAwNX0.LnH5rJzxiaxjQjrC3PcnkQ-UA0KP0feGYdI0WqiOeXY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
