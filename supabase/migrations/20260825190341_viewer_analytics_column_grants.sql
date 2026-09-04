-- Narrow the anonymous writer to business dimensions only. Database defaults
-- remain authoritative for the event identity and timestamp.

revoke insert on table public.viewer_events from anon;
grant insert (event_name, surface, provider_id) on table public.viewer_events to anon;
