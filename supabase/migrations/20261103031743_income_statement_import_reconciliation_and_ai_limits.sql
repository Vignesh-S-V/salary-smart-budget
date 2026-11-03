-- Income, statement import history, account transfers, and AI request throttling.
-- Additive migration: does not delete or rewrite existing user transactions.

create table if not exists public.statement_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  statement_start date,
  statement_end date,
  total_rows integer not null default 0 check (total_rows >= 0),
  expense_rows integer not null default 0 check (expense_rows >= 0),
  income_rows integer not null default 0 check (income_rows >= 0),
  transfer_rows integer not null default 0 check (transfer_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  opening_balance numeric(14,2),
  closing_balance numeric(14,2),
  calculated_closing_balance numeric(14,2),
  balance_difference numeric(14,2),
  reconciliation_status text not null default 'not_available'
    check (reconciliation_status in ('not_available','matched','mismatch')),
  status text not null default 'processing'
    check (status in ('processing','imported','partial_error')),
  created_at timestamptz not null default now(),
  unique (user_id, file_sha256)
);

alter table public.expenses
  add column if not exists import_batch_id uuid
  references public.statement_import_batches(id) on delete set null;

create table if not exists public.income_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_name text not null,
  amount numeric(14,2) not null check (amount > 0),
  income_type text not null default 'other'
    check (income_type in ('salary','other','refund')),
  received_at date not null,
  notes text,
  import_batch_id uuid references public.statement_import_batches(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.account_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_name text not null,
  amount numeric(14,2) not null check (amount > 0),
  direction text not null check (direction in ('incoming','outgoing')),
  transferred_at date not null,
  reference text,
  notes text,
  import_batch_id uuid references public.statement_import_batches(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (created_at >= now() - interval '2 minutes' and created_at <= now() + interval '1 minute')
);

create index if not exists expenses_import_batch_idx on public.expenses(import_batch_id);
create index if not exists expenses_category_id_idx on public.expenses(category_id);
create index if not exists income_transactions_user_date_idx on public.income_transactions(user_id, received_at desc);
create index if not exists income_transactions_import_batch_idx on public.income_transactions(import_batch_id);
create index if not exists account_transfers_user_date_idx on public.account_transfers(user_id, transferred_at desc);
create index if not exists account_transfers_import_batch_idx on public.account_transfers(import_batch_id);
create index if not exists statement_import_batches_user_created_idx on public.statement_import_batches(user_id, created_at desc);
create index if not exists ai_usage_events_user_created_idx on public.ai_usage_events(user_id, created_at desc);
create index if not exists item_price_observations_user_idx on public.item_price_observations(user_id);

alter table public.statement_import_batches enable row level security;
alter table public.income_transactions enable row level security;
alter table public.account_transfers enable row level security;
alter table public.ai_usage_events enable row level security;

do $$
declare t text;
begin
 foreach t in array array[
  'salary_history','expense_categories','expenses','monthly_budgets','item_price_observations',
  'recurring_bills','loans','savings_goals','net_worth_items',
  'statement_import_batches','income_transactions','account_transfers'
 ] loop
  execute format('drop policy if exists %I on public.%I',t||'_select_own',t);
  execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t||'_select_own',t);
  execute format('drop policy if exists %I on public.%I',t||'_insert_own',t);
  execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',t||'_insert_own',t);
  execute format('drop policy if exists %I on public.%I',t||'_update_own',t);
  execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t||'_update_own',t);
  execute format('drop policy if exists %I on public.%I',t||'_delete_own',t);
  execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',t||'_delete_own',t);
 end loop;
end $$;

drop policy if exists ai_usage_events_select_own on public.ai_usage_events;
create policy ai_usage_events_select_own on public.ai_usage_events
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists ai_usage_events_insert_own on public.ai_usage_events;
create policy ai_usage_events_insert_own on public.ai_usage_events
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and created_at >= now() - interval '30 seconds'
    and created_at <= now() + interval '30 seconds'
  );

grant select, insert, update, delete on
  public.statement_import_batches,
  public.income_transactions,
  public.account_transfers
to authenticated;
grant select, insert on public.ai_usage_events to authenticated;
