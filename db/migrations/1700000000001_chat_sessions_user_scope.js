/* eslint-disable */
/**
 * Chat sessions become user-scoped so advisors and admins can use the
 * regulation assistant as well.
 *
 * - adds `user_id` (the owning account) and backfills it from the student row
 * - keeps `student_id` for student-owned sessions (it feeds personalisation
 *   into the rule engine) but makes it optional: advisor/admin sessions store
 *   NULL there
 * - escalations stay student-bound; non-student questions never escalate
 */
exports.up = (pgm) => {
  pgm.sql(`
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;

UPDATE chat_sessions cs
   SET user_id = s.user_id
  FROM students s
 WHERE cs.student_id = s.id
   AND cs.user_id IS NULL;

ALTER TABLE chat_sessions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE chat_sessions ALTER COLUMN student_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS chat_sessions_user_idx ON chat_sessions(user_id);
`);
};

exports.down = (pgm) => {
  pgm.sql(`
DELETE FROM chat_sessions WHERE student_id IS NULL;

DROP INDEX IF EXISTS chat_sessions_user_idx;

ALTER TABLE chat_sessions ALTER COLUMN student_id SET NOT NULL;
ALTER TABLE chat_sessions DROP COLUMN IF EXISTS user_id;
`);
};
