-- Chroma schema (Supabase / PostgreSQL).
--
-- The app applies this automatically on first use, but you can also paste it
-- into the Supabase SQL Editor to create everything up front. It is idempotent.
--
-- Money is stored in minor units (cents) as bigint, matching the app.

create table if not exists chroma_users (
  id                text primary key,
  name              text not null,
  phone_number      text not null default '',
  user_type         text not null default 'individual',
  loop_account_ref  text not null unique,
  created_at        timestamptz not null default now()
);

-- LOOP token sets, already encrypted by the app (AES-256-GCM) before they
-- reach the database. Postgres never sees a usable token.
create table if not exists chroma_loop_tokens (
  user_id     text primary key references chroma_users(id) on delete cascade,
  payload     text not null,
  updated_at  timestamptz not null default now()
);

create table if not exists chroma_boards (
  id             text primary key,
  user_id        text not null references chroma_users(id) on delete cascade,
  name           text not null,
  color_code     text not null,
  budget_amount  bigint,
  created_at     timestamptz not null default now()
);

create index if not exists chroma_boards_user_idx on chroma_boards (user_id, created_at);

create table if not exists chroma_transactions (
  id                   text primary key,
  user_id              text not null references chroma_users(id) on delete cascade,
  loop_transaction_id  text not null,
  amount               bigint not null,
  currency             text not null default 'KES',
  direction            text not null,
  occurred_at          timestamptz not null,
  counterparty         text not null default 'Unknown',
  source               text not null default 'transfer',
  description          text not null default '',
  reference            text,
  -- Deleting a Board untags its transactions; it never deletes LOOP data.
  board_id             text references chroma_boards(id) on delete set null,
  live                 boolean not null default false,
  unique (user_id, loop_transaction_id)
);

create index if not exists chroma_transactions_user_idx on chroma_transactions (user_id, occurred_at desc);
create index if not exists chroma_transactions_board_idx on chroma_transactions (board_id);

create table if not exists chroma_insights (
  id            text primary key,
  user_id       text not null references chroma_users(id) on delete cascade,
  board_id      text references chroma_boards(id) on delete cascade,
  message       text not null,
  type          text not null default 'trend',
  origin        text not null default 'rules',
  generated_at  timestamptz not null default now()
);

create index if not exists chroma_insights_user_idx on chroma_insights (user_id, generated_at desc);

-- Recurring commitments: bills, savings, investments.
create table if not exists chroma_standing_orders (
  id           text primary key,
  user_id      text not null references chroma_users(id) on delete cascade,
  name         text not null,
  kind         text not null default 'bill',
  amount       bigint not null,
  currency     text not null default 'KES',
  frequency    text not null default 'monthly',
  destination  text not null,
  reference    text,
  -- Keep the order if its Board goes away; it just becomes unfiled.
  board_id     text references chroma_boards(id) on delete set null,
  status       text not null default 'active',
  next_run_at  timestamptz not null,
  last_run_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- The runner's query: active orders that are due, oldest first.
create index if not exists chroma_standing_orders_due_idx
  on chroma_standing_orders (status, next_run_at);
create index if not exists chroma_standing_orders_user_idx
  on chroma_standing_orders (user_id, created_at);

create table if not exists chroma_sync_state (
  user_id    text primary key references chroma_users(id) on delete cascade,
  last_sync  timestamptz not null
);

-- Chroma connects as the `postgres` role over the connection string, which
-- bypasses RLS. Enabling RLS with no policies therefore changes nothing for
-- the app, while slamming the door on Supabase's public anon REST API — which
-- would otherwise expose every table to anyone holding the publishable key.
alter table chroma_users            enable row level security;
alter table chroma_loop_tokens      enable row level security;
alter table chroma_boards           enable row level security;
alter table chroma_transactions     enable row level security;
alter table chroma_insights         enable row level security;
alter table chroma_sync_state       enable row level security;
alter table chroma_standing_orders  enable row level security;
