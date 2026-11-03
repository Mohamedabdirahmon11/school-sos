CREATE TABLE IF NOT EXISTS notice_reads (
  id VARCHAR(160) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  notice_id VARCHAR(64) NOT NULL REFERENCES school_notices(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, notice_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_notice_reads_user ON notice_reads(school_id, user_id);
ALTER TABLE notice_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notice_reads_self_scope ON notice_reads;
CREATE POLICY notice_reads_self_scope ON notice_reads AS RESTRICTIVE FOR SELECT TO authenticated
  USING (school_id = auth_school_id() AND user_id = auth_user_id());
DROP POLICY IF EXISTS notice_reads_self_insert ON notice_reads;
CREATE POLICY notice_reads_self_insert ON notice_reads AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (school_id = auth_school_id() AND user_id = auth_user_id());
