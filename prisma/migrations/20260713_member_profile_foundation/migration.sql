-- CreateTable
CREATE TABLE "member_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" VARCHAR(800),
    "phoneNumber" VARCHAR(40),
    "location" VARCHAR(120),
    "occupation" VARCHAR(120),
    "profileImageUrl" VARCHAR(500),
    "favouriteGenres" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "favouriteBooks" VARCHAR(800),
    "readingInterests" VARCHAR(800),
    "currentlyReadingText" VARCHAR(240),
    "currentlyListeningTitle" VARCHAR(180),
    "currentlyListeningCreator" VARCHAR(180),
    "currentlyListeningUrl" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_profiles_userId_key" ON "member_profiles"("userId");

-- CreateIndex
CREATE INDEX "member_profiles_location_idx" ON "member_profiles"("location");

-- CreateIndex
CREATE INDEX "member_profiles_updatedAt_idx" ON "member_profiles"("updatedAt");

-- AddForeignKey
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
