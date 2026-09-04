-- Cover the lab_updates foreign key for update deletion/cascade checks.

create index if not exists user_notification_state_update_idx
  on public.user_notification_state(update_id);
