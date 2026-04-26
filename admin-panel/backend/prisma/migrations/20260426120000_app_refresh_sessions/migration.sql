-- Refresh tokens for mobile app (short-lived access JWT + long-lived opaque refresh).

CREATE TABLE "app_refresh_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "device_id" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_refresh_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_refresh_sessions_token_hash_key" ON "app_refresh_sessions"("token_hash");

CREATE INDEX "app_refresh_sessions_user_id_idx" ON "app_refresh_sessions"("user_id");

CREATE INDEX "app_refresh_sessions_user_id_session_id_idx" ON "app_refresh_sessions"("user_id", "session_id");

CREATE INDEX "app_refresh_sessions_expires_at_idx" ON "app_refresh_sessions"("expires_at");

ALTER TABLE "app_refresh_sessions" ADD CONSTRAINT "app_refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
