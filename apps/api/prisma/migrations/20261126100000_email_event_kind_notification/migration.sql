-- Task 20: extend EmailEventKind before the notifications migration uses the new value.
-- PostgreSQL cannot use a newly added enum value in the same transaction, so this
-- file is its own migration and commits before 20261126100100_notifications.

ALTER TYPE "EmailEventKind" ADD VALUE IF NOT EXISTS 'NOTIFICATION';
