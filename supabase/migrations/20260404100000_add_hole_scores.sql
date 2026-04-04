-- Hole-by-hole score cache from Slash Golf API
CREATE TABLE hole_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  golfer_id text NOT NULL,
  golfer_name text NOT NULL,
  round_number int NOT NULL,
  hole_number int NOT NULL,
  par int NOT NULL,
  score int NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pool_id, golfer_id, round_number, hole_number)
);

CREATE INDEX idx_hole_scores_lookup ON hole_scores(pool_id, golfer_id, round_number);

-- API call tracking for budget management
CREATE TABLE api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'slashgolf',
  endpoint text NOT NULL,
  called_at timestamptz NOT NULL DEFAULT now(),
  month_key text NOT NULL DEFAULT to_char(now(), 'YYYY-MM')
);

CREATE INDEX idx_api_usage_month ON api_usage(provider, month_key);

-- RLS
ALTER TABLE hole_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Anon can read hole_scores
CREATE POLICY "Hole scores viewable" ON hole_scores FOR SELECT USING (true);
-- Anon cannot write
REVOKE ALL ON hole_scores FROM anon;
GRANT SELECT ON hole_scores TO anon;

-- api_usage not readable by anon at all
REVOKE ALL ON api_usage FROM anon;
