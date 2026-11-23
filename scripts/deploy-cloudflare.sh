#!/usr/bin/env bash
set -euo pipefail

export APP_MODE="protected"
export AUTH_PROVIDER="google"
export ALLOWED_EMAIL_DOMAIN="*"
export GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-156239282104-hrqn03pnum5b63clrj1ak3rf2qfm5bp2.apps.googleusercontent.com}"
export CHROME_EXTENSION_ID="${CHROME_EXTENSION_ID:-cgffleilghhdejlgfkfboeplimlmflmn}"
export PUBLIC_APP_URL="${PUBLIC_APP_URL:-https://incora-people.incora-people.workers.dev}"

npm run quality
npm run build

node --input-type=module <<'NODE'
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile("dist/server/wrangler.json", "utf8"));
const vars = config.vars ?? {};
const expected = {
  APP_MODE: "protected",
  AUTH_PROVIDER: "google",
  ALLOWED_EMAIL_DOMAIN: "*",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  CHROME_EXTENSION_ID: process.env.CHROME_EXTENSION_ID,
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
};

for (const [key, value] of Object.entries(expected)) {
  if (vars[key] !== value) {
    throw new Error(`Production build guard failed: ${key} is not configured.`);
  }
}
NODE

secret_names="$(npx wrangler secret list -c dist/server/wrangler.json)"
for required_secret in AUTH_SECRET GOOGLE_CLIENT_SECRET; do
  if ! grep -q "\"name\": \"${required_secret}\"" <<<"${secret_names}"; then
    echo "Missing required Cloudflare secret: ${required_secret}" >&2
    exit 1
  fi
done

npm run db:migrate:remote:built
npx wrangler deploy -c dist/server/wrangler.json
