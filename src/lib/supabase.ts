import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://sgkhsncgtcnqfgqfjcdr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNna2hzbmNndGNucWZncWZqY2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NjI0MDUsImV4cCI6MjEwNTMzODQwNX0.CZL0yEyx5vFNlAWEcKSiAnzXLIM9uNuWCHhcnsOHSEs',
)
