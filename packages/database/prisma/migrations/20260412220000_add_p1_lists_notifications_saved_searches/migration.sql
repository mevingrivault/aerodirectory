CREATE TABLE "public"."saved_searches" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'search',
  "params" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."aerodrome_lists" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "aerodrome_lists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."aerodrome_list_items" (
  "id" TEXT NOT NULL,
  "listId" TEXT NOT NULL,
  "aerodromeId" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "aerodrome_list_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."notifications" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "linkUrl" TEXT,
  "metadata" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "saved_searches_userId_scope_idx"
ON "public"."saved_searches"("userId", "scope");

CREATE UNIQUE INDEX "aerodrome_lists_userId_name_key"
ON "public"."aerodrome_lists"("userId", "name");

CREATE INDEX "aerodrome_lists_userId_createdAt_idx"
ON "public"."aerodrome_lists"("userId", "createdAt");

CREATE UNIQUE INDEX "aerodrome_list_items_listId_aerodromeId_key"
ON "public"."aerodrome_list_items"("listId", "aerodromeId");

CREATE INDEX "aerodrome_list_items_aerodromeId_idx"
ON "public"."aerodrome_list_items"("aerodromeId");

CREATE INDEX "notifications_userId_readAt_createdAt_idx"
ON "public"."notifications"("userId", "readAt", "createdAt");

ALTER TABLE "public"."saved_searches"
ADD CONSTRAINT "saved_searches_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "public"."users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."aerodrome_lists"
ADD CONSTRAINT "aerodrome_lists_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "public"."users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."aerodrome_list_items"
ADD CONSTRAINT "aerodrome_list_items_listId_fkey"
FOREIGN KEY ("listId") REFERENCES "public"."aerodrome_lists"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."aerodrome_list_items"
ADD CONSTRAINT "aerodrome_list_items_aerodromeId_fkey"
FOREIGN KEY ("aerodromeId") REFERENCES "public"."aerodromes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."notifications"
ADD CONSTRAINT "notifications_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "public"."users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
