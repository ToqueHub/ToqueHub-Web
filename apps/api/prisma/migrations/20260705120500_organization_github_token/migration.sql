ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "githubToken" TEXT,
  ADD COLUMN IF NOT EXISTS "githubTokenUpdatedAt" TIMESTAMP(3);
