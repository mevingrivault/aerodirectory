ALTER TABLE "public"."comments"
ADD COLUMN "parentId" TEXT;

ALTER TABLE "public"."comments"
ADD CONSTRAINT "comments_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "public"."comments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "comments_parentId_idx" ON "public"."comments"("parentId");
