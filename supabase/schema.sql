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
