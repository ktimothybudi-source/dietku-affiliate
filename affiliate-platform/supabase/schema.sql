create extension if not exists "pgcrypto";

create table if not exists affiliates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  referral_code text not null unique,
  role text not null default 'affiliate',
  created_at timestamptz not null default now()
);

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  referred_user_id uuid not null unique,
  referred_email text not null,
  ip_address text not null,
  user_agent text not null,
  status text not null default 'signup',
  created_at timestamptz not null default now()
);

create table if not exists affiliate_metrics (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  period_start timestamptz not null default now(),
  clicks int not null default 0,
  visits int not null default 0,
  signups int not null default 0,
  conversions int not null default 0,
  rewards numeric(10,2) not null default 0,
  points int generated always as ((signups * 5) + (conversions * 20)) stored
);

create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  amount_usd numeric(10,2) not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists idx_affiliate_metrics_affiliate_id on affiliate_metrics(affiliate_id);
create index if not exists idx_referrals_affiliate_id on referrals(affiliate_id);
create index if not exists idx_referrals_created_at on referrals(created_at desc);
