# Salary Smart Budget

A personal salary and expense tracker built with Next.js, TypeScript, Tailwind CSS, Recharts and Supabase Auth/Postgres.

## Features
- Email/password sign-up and sign-in with Supabase Auth.
- Salary history with effective date and salary-change flow.
- Expense entry with suggested categories and custom categories.
- Persistent expenses and salary records in Supabase.
- Balance, category analytics, daily spend and repeat-item totals.
- Next-month budget recommendation based on recorded spend and current salary.
- Row Level Security policies scope each row to `auth.uid()`.

## Setup
1. Run `supabase/schema.sql` in the SQL Editor of the dedicated Supabase project.
2. Copy `.env.example` to `.env.local` and add the project URL and publishable key.
3. Run `npm install`, then `npm run dev`.
4. Configure Supabase Auth email confirmation and redirect URLs for localhost and your deployed URL.
5. Deploy on Render as a Node web service with build command `npm install && npm run build`, start command `npm start`, and both public Supabase client environment variables.

Never place a Supabase service-role key in browser environment variables. Live grocery prices are not guessed; price comparisons need a verified source and are not included in the first release.
