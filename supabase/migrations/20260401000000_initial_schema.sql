-- Masters Golf Pool Schema

-- Pools
create table pools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tournament_name text not null default 'The Masters 2026',
  invite_code text unique not null,
  status text not null default 'lobby' check (status in ('lobby', 'drafting', 'active', 'complete')),
  commissioner_token text not null,
  players_per_team int not null default 6,
  scoring_players int not null default 5,
  missed_cut_score int not null default 80,
  drop_deadline_round int not null default 2,
  draft_timer_seconds int not null default 90,
  buy_in_amount numeric(10,2) not null default 50.00,
  created_at timestamptz not null default now()
);

-- Payout rules (variable positions per pool)
create table payout_rules (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  position int not null,
  percentage numeric(5,2) not null,
  unique (pool_id, position)
);

-- Teams
create table teams (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  owner_name text not null,
  session_token text not null,
  draft_position int,
  is_commissioner boolean not null default false,
  buy_in_paid boolean not null default false,
  created_at timestamptz not null default now(),
  unique (pool_id, session_token)
);

-- Draft state (one row per pool)
create table draft_state (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid unique not null references pools(id) on delete cascade,
  current_pick int not null default 0,
  total_picks int not null default 0,
  is_paused boolean not null default false,
  timer_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Draft picks
create table draft_picks (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  golfer_id text not null,
  golfer_name text not null,
  pick_number int not null,
  round int not null,
  picked_at timestamptz not null default now(),
  unique (pool_id, pick_number),
  unique (pool_id, golfer_id)
);

-- Team golfers (roster after draft)
create table team_golfers (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  golfer_id text not null,
  golfer_name text not null,
  is_dropped boolean not null default false,
  dropped_at timestamptz,
  unique (pool_id, team_id, golfer_id)
);

-- Golfer scores
create table golfer_scores (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  golfer_id text not null,
  golfer_name text not null,
  round_number int,
  score_to_par int,
  total_to_par int not null default 0,
  thru_hole int,
  status text not null default 'active' check (status in ('active', 'cut', 'withdrawn', 'dq')),
  world_ranking int,
  updated_at timestamptz not null default now(),
  unique (pool_id, golfer_id, round_number)
);

-- Payments
create table payments (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  type text not null check (type in ('buy_in', 'payout')),
  amount numeric(10,2) not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'sent')),
  method text not null default 'manual',
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_teams_pool_id on teams(pool_id);
create index idx_teams_session_token on teams(session_token);
create index idx_draft_picks_pool_id on draft_picks(pool_id);
create index idx_team_golfers_pool_team on team_golfers(pool_id, team_id);
create index idx_golfer_scores_pool on golfer_scores(pool_id);
create index idx_pools_invite_code on pools(invite_code);

-- Enable Realtime
alter publication supabase_realtime add table draft_picks;
alter publication supabase_realtime add table draft_state;
alter publication supabase_realtime add table golfer_scores;
alter publication supabase_realtime add table team_golfers;
alter publication supabase_realtime add table teams;

-- Row Level Security
alter table pools enable row level security;
alter table payout_rules enable row level security;
alter table teams enable row level security;
alter table draft_state enable row level security;
alter table draft_picks enable row level security;
alter table team_golfers enable row level security;
alter table golfer_scores enable row level security;
alter table payments enable row level security;

-- Policies: pools are readable by anyone with the invite code (handled at app level)
-- Using anon key with service role for mutations
create policy "Pools are viewable by everyone" on pools for select using (true);
create policy "Pools insertable by anyone" on pools for insert with check (true);
create policy "Pools updatable by commissioner" on pools for update using (true);

create policy "Payout rules viewable" on payout_rules for select using (true);
create policy "Payout rules insertable" on payout_rules for insert with check (true);
create policy "Payout rules updatable" on payout_rules for update using (true);

create policy "Teams viewable" on teams for select using (true);
create policy "Teams insertable" on teams for insert with check (true);
create policy "Teams updatable" on teams for update using (true);

create policy "Draft state viewable" on draft_state for select using (true);
create policy "Draft state insertable" on draft_state for insert with check (true);
create policy "Draft state updatable" on draft_state for update using (true);

create policy "Draft picks viewable" on draft_picks for select using (true);
create policy "Draft picks insertable" on draft_picks for insert with check (true);

create policy "Team golfers viewable" on team_golfers for select using (true);
create policy "Team golfers insertable" on team_golfers for insert with check (true);
create policy "Team golfers updatable" on team_golfers for update using (true);

create policy "Golfer scores viewable" on golfer_scores for select using (true);
create policy "Golfer scores insertable" on golfer_scores for insert with check (true);
create policy "Golfer scores updatable" on golfer_scores for update using (true);

create policy "Payments viewable" on payments for select using (true);
create policy "Payments insertable" on payments for insert with check (true);
create policy "Payments updatable" on payments for update using (true);
