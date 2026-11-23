declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    APP_MODE?: string;
    DEMO_USER_EMAIL?: string;
    ALLOWED_EMAIL_DOMAIN?: string;
    CF_ACCESS_TEAM_DOMAIN?: string;
    CF_ACCESS_AUD?: string;
    PUBLIC_APP_URL?: string;
    FILES_REQUIRE_SCAN?: string;
    FILE_SCAN_WEBHOOK_SECRET?: string;
  }
}
