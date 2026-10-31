-- Sync sources for the OurAirports links and the Wikimedia Commons photos.
-- ADD VALUE is allowed in a transaction since PostgreSQL 12, as long as the
-- new value is not used in the same transaction.
ALTER TYPE "public"."SyncSource" ADD VALUE IF NOT EXISTS 'OURAIRPORTS';
ALTER TYPE "public"."SyncSource" ADD VALUE IF NOT EXISTS 'COMMONS';
