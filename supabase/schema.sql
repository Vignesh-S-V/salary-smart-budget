-- Salary Smart Budget schema. Run only in the dedicated salary-smart-budget project.
create extension if not exists pgcrypto;
create table if not exists public.salary_history (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, monthly_salary numeric(12,2) not null check(monthly_salary >= 0), effective_from date not null default current_date, note text, created_at timestamptz not null default now());
create index if not exists salary_history_user_date_idx on public.salary_history(user_id,effective_from desc);
create table if not exists public.expense_categories (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null, color text not null default '#9cf6c5', created_at timestamptz not null default now(), unique(user_id,name));
create table if not exists public.expenses (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, item_name text not null, amount numeric(12,2) not null check(amount > 0), quantity numeric(12,3) not null default 1 check(quantity > 0), category_id uuid references public.expense_categories(id) on delete set null, category_name text not null default 'Other', spent_at date not null default current_date, notes text, created_at timestamptz not null default now());
create index if not exists expenses_user_date_idx on public.expenses(user_id,spent_at desc);
create index if not exists expenses_user_item_idx on public.expenses(user_id,item_name);
create table if not exists public.monthly_budgets (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, month_start date not null, category_name text not null, planned_amount numeric(12,2) not null default 0 check(planned_amount >= 0), created_at timestamptz not null default now(), unique(user_id,month_start,category_name));
create table if not exists public.item_price_observations (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, item_name text not null, unit_price numeric(12,2) not null check(unit_price >= 0), observed_at date not null default current_date, source_url text, source_label text, created_at timestamptz not null default now());
alter table public.salary_history enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.monthly_budgets enable row level security;
alter table public.item_price_observations enable row level security;
do $$ declare t text; begin foreach t in array array['salary_history','expense_categories','expenses','monthly_budgets','item_price_observations'] loop
execute format('drop policy if exists %I on public.%I',t||'_select_own',t); execute format('create policy %I on public.%I for select using (auth.uid()=user_id)',t||'_select_own',t);
execute format('drop policy if exists %I on public.%I',t||'_insert_own',t); execute format('create policy %I on public.%I for insert with check (auth.uid()=user_id)',t||'_insert_own',t);
execute format('drop policy if exists %I on public.%I',t||'_update_own',t); execute format('create policy %I on public.%I for update using (auth.uid()=user_id) with check (auth.uid()=user_id)',t||'_update_own',t);
execute format('drop policy if exists %I on public.%I',t||'_delete_own',t); execute format('create policy %I on public.%I for delete using (auth.uid()=user_id)',t||'_delete_own',t);
end loop; end $$;

-- Personal finance modules (also tracked as an additive migration).
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
