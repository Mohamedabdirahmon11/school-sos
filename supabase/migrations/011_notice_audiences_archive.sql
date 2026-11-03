ALTER TABLE school_notices ADD COLUMN IF NOT EXISTS class_id VARCHAR(64);
ALTER TABLE school_notices ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_notices_active_audience ON school_notices(school_id, is_active, audience, publish_date DESC);
