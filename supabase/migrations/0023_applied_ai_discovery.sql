-- Sprint 25: Applied AI Opportunity Discovery Mode.
--
-- Adds a new meeting_type enum value for the Applied AI Discovery meeting
-- mode (Part A) - additive only, every existing meeting_type value is
-- untouched. Postgres requires ALTER TYPE ... ADD VALUE to run outside an
-- explicit transaction block and to not be used in the same transaction as
-- a statement that reads the new value, so this migration only adds the
-- value; anything that queries against it happens in later statements/
-- migrations or from the application layer.

alter type meeting_type add value 'applied_ai_discovery';
