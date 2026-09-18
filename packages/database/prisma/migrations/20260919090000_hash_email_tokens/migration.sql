-- E-mail tokens are now stored as SHA-256 hex digests of the raw token.
-- Tokens still pending are hashed in place so links already sent keep working;
-- used or expired rows are irrelevant and left untouched.
UPDATE "public"."email_tokens"
SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex')
WHERE "usedAt" IS NULL
  AND "expiresAt" > NOW();
