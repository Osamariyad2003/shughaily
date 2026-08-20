-- 007_case_insensitive_email_and_application_dedup.sql
--
-- Two independent, defense-in-depth constraints found during a QA pass:
--
-- 1. users.email had no case-insensitive uniqueness. The application layer
--    now normalizes emails to lowercase before every lookup/insert (see
--    auth.validator.ts / auth.controller.ts), but that alone doesn't stop
--    a second write path (a script, a future endpoint, a manual DB edit)
--    from re-introducing a case-variant duplicate. This adds a unique
--    index on lower(email) so the database itself refuses it.
--
-- 2. applications had no uniqueness guard at all — "already applied" was
--    enforced only by a SELECT-then-INSERT check in the controller, a
--    TOCTOU race under real concurrency. This adds a partial unique index
--    on (user_id, job_id) excluding withdrawn applications, so a user can
--    re-apply after withdrawing but can never hold two live applications
--    for the same job no matter how the requests interleave.
--
-- IMPORTANT: if this database already has case-variant duplicate emails
-- (e.g. 'user@x.com' and 'User@x.com' as two separate accounts) or
-- duplicate live applications, step 1 or 2 below will fail with a unique
-- violation until those rows are deregistered/manually reconciled. Query
-- for them first:
--   SELECT lower(email), COUNT(*) FROM users GROUP BY lower(email) HAVING COUNT(*) > 1;
--   SELECT user_id, job_id, COUNT(*) FROM applications WHERE status != 'withdrawn' GROUP BY user_id, job_id HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique
    ON users (lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_user_job_live_unique
    ON applications (user_id, job_id)
    WHERE status != 'withdrawn';
