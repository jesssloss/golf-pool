-- Add draft_mode column to pools table
-- Values: 'live' (real-time draft with timers) or 'manual' (commissioner enters all picks)
alter table pools add column draft_mode text not null default 'live' check (draft_mode in ('live', 'manual'));
