-- Additive personal-finance tables. Existing salary, expense, budget and auth rows are untouched.
create table if not exists public.recurring_bills (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 120), amount numeric(12,2) not null check (amount > 0),
 frequency text not null default 'monthly' check (frequency in ('weekly','monthly','quarterly','yearly')),
 category_name text not null default 'Bills', next_due_date date not null, is_active boolean not null default true,
 notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists recurring_bills_user_due_idx on public.recurring_bills(user_id,is_active,next_due_date);
create table if not exists public.loans (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 lender text not null check (length(trim(lender)) between 1 and 120), loan_type text not null default 'Personal',
 principal_amount numeric(12,2) not null check (principal_amount > 0), outstanding_balance numeric(12,2) not null check (outstanding_balance >= 0),
 annual_interest_rate numeric(6,3) not null default 0 check (annual_interest_rate between 0 and 100),
 emi_amount numeric(12,2) not null default 0 check (emi_amount >= 0), next_due_date date,
 status text not null default 'active' check (status in ('active','closed')), notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (outstanding_balance <= principal_amount)
);
create index if not exists loans_user_status_idx on public.loans(user_id,status);
create table if not exists public.savings_goals (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 120), target_amount numeric(12,2) not null check (target_amount > 0),
 current_amount numeric(12,2) not null default 0 check (current_amount >= 0), target_date date, notes text,
 status text not null default 'active' check (status in ('active','completed','paused')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists savings_goals_user_status_idx on public.savings_goals(user_id,status);
create table if not exists public.net_worth_items (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 entry_type text not null check (entry_type in ('asset','liability')), name text not null check (length(trim(name)) between 1 and 120),
 current_value numeric(12,2) not null check (current_value >= 0), notes text,
 as_of_date date not null default current_date, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists net_worth_items_user_date_idx on public.net_worth_items(user_id,as_of_date desc);
alter table public.recurring_bills enable row level security;
alter table public.loans enable row level security;
alter table public.savings_goals enable row level security;
alter table public.net_worth_items enable row level security;
do $$
declare t text;
begin
 foreach t in array array['recurring_bills','loans','savings_goals','net_worth_items'] loop
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
grant select,insert,update,delete on public.recurring_bills,public.loans,public.savings_goals,public.net_worth_items to authenticated;
