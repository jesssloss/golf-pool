-- Harden RLS: restrict anon role to read-only, hide sensitive columns
-- The service role key (used by API routes) bypasses RLS entirely.

-- ============================================================
-- 1. Drop all existing permissive INSERT/UPDATE/DELETE policies
-- ============================================================

-- pools
drop policy if exists "Pools insertable by anyone" on pools;
drop policy if exists "Pools updatable by commissioner" on pools;

-- payout_rules
drop policy if exists "Payout rules insertable" on payout_rules;
drop policy if exists "Payout rules updatable" on payout_rules;

-- teams
drop policy if exists "Teams insertable" on teams;
drop policy if exists "Teams updatable" on teams;

-- draft_state
drop policy if exists "Draft state insertable" on draft_state;
drop policy if exists "Draft state updatable" on draft_state;

-- draft_picks
drop policy if exists "Draft picks insertable" on draft_picks;

-- team_golfers
drop policy if exists "Team golfers insertable" on team_golfers;
drop policy if exists "Team golfers updatable" on team_golfers;

-- golfer_scores
drop policy if exists "Golfer scores insertable" on golfer_scores;
drop policy if exists "Golfer scores updatable" on golfer_scores;

-- payments
drop policy if exists "Payments insertable" on payments;
drop policy if exists "Payments updatable" on payments;


-- ============================================================
-- 2. Revoke all privileges from anon, then grant SELECT only
-- ============================================================

revoke all on pools from anon;
grant select on pools to anon;

revoke all on payout_rules from anon;
grant select on payout_rules to anon;

revoke all on teams from anon;
grant select on teams to anon;

revoke all on draft_state from anon;
grant select on draft_state to anon;

revoke all on draft_picks from anon;
grant select on draft_picks to anon;

revoke all on team_golfers from anon;
grant select on team_golfers to anon;

revoke all on golfer_scores from anon;
grant select on golfer_scores to anon;

revoke all on payments from anon;
grant select on payments to anon;


-- ============================================================
-- 3. Column-level revokes to hide sensitive tokens from anon
-- ============================================================

revoke select (commissioner_token) on pools from anon;
revoke select (session_token) on teams from anon;


-- ============================================================
-- 4. SELECT policies remain (using true) for anon reads
--    These already exist from the initial migration, kept as-is:
--    "Pools are viewable by everyone"
--    "Payout rules viewable"
--    "Teams viewable"
--    "Draft state viewable"
--    "Draft picks viewable"
--    "Team golfers viewable"
--    "Golfer scores viewable"
--    "Payments viewable"
-- ============================================================
