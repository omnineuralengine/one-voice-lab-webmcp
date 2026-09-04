-- release-stage stores only an explicit presentation preference. It cannot grant
-- access, change ownership, enable a provider, or alter execution policy.

alter table public.user_preferences
  add column interface_depth text not null default 'guided'
  check (interface_depth in ('essential', 'guided', 'detailed', 'technical'));

comment on column public.user_preferences.interface_depth is
  'Human-selected presentation depth only. Never authorization, ownership, trust, or provider policy.';
