ALTER TABLE pools ADD COLUMN slug text UNIQUE;
CREATE INDEX idx_pools_slug ON pools (slug);
