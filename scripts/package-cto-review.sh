#!/usr/bin/env bash
set -euo pipefail

# Build a deterministic, privacy-redacted source package for an external CTO
# review. This script deliberately stages outside the repository, preserves
# executable source files, and validates the resulting ZIP before returning.

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
review_date="${CTO_REVIEW_DATE:-$(date -u +%F)}"
archive_path="${CTO_REVIEW_ARCHIVE:-$project_root/incora-people-cto-review-${review_date}.zip}"
stage_root="$(mktemp -d "${TMPDIR:-/tmp}/incora-cto-review.XXXXXX")"
stage_project="$stage_root/incora-people-cto-review-${review_date}"
cleanup() { rm -rf "$stage_root"; }
trap cleanup EXIT

mkdir -p "$stage_project"

rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.wrangler' \
  --exclude='.vinext' \
  --exclude='.next' \
  --exclude='dist' \
  --exclude='out' \
  --exclude='coverage' \
  --exclude='*.tsbuildinfo' \
  --exclude='apps/mobile/.expo' \
  --exclude='apps/mobile/node_modules' \
  --exclude='apps/mobile/dist*' \
  --exclude='*.keystore' \
  --exclude='*.jks' \
  --exclude='outputs' \
  --exclude='work' \
  --exclude='.settings-capture' \
  --exclude='tools' \
  --exclude='public/downloads' \
  --exclude='*.zip' \
  --exclude='*.bundle' \
  --exclude='.env' \
  --exclude='.dev.vars' \
  --exclude='.dev.vars.*' \
  --exclude='.openai/hosting.json' \
  --exclude='CONVERSATION_TRANSCRIPT.txt' \
  --exclude='/*.png' \
  --exclude='/*.jpg' \
  --exclude='/*.jpeg' \
  --exclude='/*.webp' \
  "$project_root/" "$stage_project/"

# Keep the build reproducible without copying real Sites identifiers.
cp "$project_root/.openai/hosting.example.json" "$stage_project/.openai/hosting.json"
node --input-type=module -e '
  import { readFileSync, writeFileSync } from "node:fs";
  const file = process.argv[1];
  const config = JSON.parse(readFileSync(file, "utf8"));
  config.project_id = "demo-project";
  config.d1 = "DB";
  config.r2 = "FILES";
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
' "$stage_project/.openai/hosting.json"

STAGE_PROJECT="$stage_project" node --input-type=module <<'NODE'
import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.env.STAGE_PROJECT;
const textExtensions = new Set([
  ".cjs", ".css", ".html", ".js", ".json", ".mjs", ".md", ".sql", ".sh",
  ".ts", ".tsx", ".txt", ".yaml", ".yml", ".example",
]);

const knownNames = new Map([
  ["Danylo Karpa", "Demo Admin"],
  ["Tetiana Stoyko", "Demo Admin Two"],
  ["Nadiia Zakaliuzhna", "Demo Admin Three"],
  ["Bohdan Vasylkiv", "Demo Admin Four"],
  ["Sofiia Melnyk", "Synthetic Person 02"],
  ["Andrii Savchuk", "Synthetic Person 03"],
  ["Iryna Tkachenko", "Synthetic Person 04"],
  ["Maksym Hnatiuk", "Synthetic Person 05"],
  ["Olena Bohdan", "Synthetic Person 06"],
  ["Roman Klym", "Synthetic Person 07"],
  ["Oleksandr Kravets", "Synthetic Person 08"],
  ["Marta Bondar", "Synthetic Person 09"],
  ["Nazar Hrytsenko", "Synthetic Person 10"],
]);

const knownFirstNames = new Map([
  ["Danylo", "Demo"], ["Tetiana", "Taylor"], ["Nadiia", "Riley"],
  ["Bohdan", "Morgan"], ["Sofiia", "Casey"], ["Andrii", "Jordan"],
  ["Iryna", "Avery"], ["Maksym", "Quinn"], ["Olena", "Jamie"],
  ["Roman", "Alex"], ["Oleksandr", "Chris"], ["Marta", "Robin"],
  ["Nazar", "Sam"],
]);
const knownLastNames = new Map([
  ["Karpa", "Admin"], ["Stoyko", "One"], ["Zakaliuzhna", "Two"],
  ["Vasylkiv", "Three"], ["Melnyk", "User02"], ["Savchuk", "User03"],
  ["Tkachenko", "User04"], ["Hnatiuk", "User05"], ["Bohdan", "User06"],
  ["Klym", "User07"], ["Kravets", "User08"], ["Bondar", "User09"],
  ["Hrytsenko", "User10"],
]);
const emailMap = new Map();
const fixedEmailMap = new Map([
  ["bohdan.vasylkiv@incorainc.com", "user001@example.test"],
  ["danylo.karpa@incorainc.com", "user002@example.test"],
  ["nadiia.zakaliuzhna@incorainc.com", "user003@example.test"],
  ["tetiana.stoyko@incorainc.com", "user004@example.test"],
]);
let emailIndex = fixedEmailMap.size + 1;

async function filesIn(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesIn(file));
    else result.push(file);
  }
  return result;
}

function redact(value) {
  value = value.replace(/\b[A-Z0-9._%+-]+@(incorainc\.com|gmail\.com)\b/gi, (email) => {
    const key = email.toLowerCase();
    if (fixedEmailMap.has(key)) return fixedEmailMap.get(key);
    if (!emailMap.has(key)) emailMap.set(key, `user${String(emailIndex++).padStart(3, "0")}@example.test`);
    return emailMap.get(key);
  });
  value = value.replace(/\+380[0-9 ()-]{7,}/g, "+000 00 000 0000");
  value = value.replace(/https?:\/\/[^\s"'<>}]*incora-people[^\s"'<>}]*/gi, "https://people.example.test");
  value = value.replace(/alisaruna90/gi, "review-example");
  for (const [from, to] of [...knownNames].sort((a, b) => b[0].length - a[0].length)) value = value.split(from).join(to);
  for (const [from, to] of knownFirstNames) value = value.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  for (const [from, to] of knownLastNames) value = value.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  value = value.replace(/GOCSPX-[A-Za-z0-9_-]+/g, "REDACTED_GOOGLE_SECRET");
  value = value.replace(/AIza[A-Za-z0-9_-]+/g, "REDACTED_GOOGLE_KEY");
  return value;
}

for (const file of await filesIn(root)) {
  if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
  const buffer = await fs.readFile(file);
  if (buffer.includes(0)) continue;
  const original = buffer.toString("utf8");
  const sanitized = redact(original);
  if (sanitized !== original) await fs.writeFile(file, sanitized);
}
NODE

# Redaction can change line lengths in source and SQL fixtures. Reformat the
# staged text after sanitizing so a reviewer can run the same format gate.
if [[ -x "$project_root/node_modules/.bin/prettier" ]]; then
  (
    cd "$stage_project"
    "$project_root/node_modules/.bin/prettier" --write \
      "app/**/*.{ts,tsx}" "components/**/*.{ts,tsx}" "lib/**/*.ts" \
      "modules/**/*.ts" "db/**/*.ts" "worker/**/*.ts" "tests/**/*.mjs" \
      "*.md" "docs/**/*.md" package.json >/dev/null
  )
fi

rm -f "$archive_path"
(cd "$stage_root" && zip -qr "$archive_path" "$(basename "$stage_project")")

unzip -t "$archive_path" >/dev/null
entries="$(unzip -Z1 "$archive_path")"
for required in \
  "${stage_project##*/}/.openai/hosting.json" \
  "${stage_project##*/}/build/sites-vite-plugin.ts" \
  "${stage_project##*/}/db/demo-seed.sql" \
  "${stage_project##*/}/drizzle/0009_sites_demo_seed.sql" \
  "${stage_project##*/}/tests/database-integration.test.mjs"; do
  grep -Fxq "$required" <<<"$entries" || { echo "Missing review entry: $required" >&2; exit 1; }
done
if grep -Eq '(^|/)(node_modules/|\.git/|\.wrangler/|\.vinext/|\.expo/|dist/|build/.*\.tsbuildinfo$|\.env$|.*\.zip$|.*\.(keystore|jks)$)' <<<"$entries"; then
  echo "Review archive contains a forbidden path." >&2
  exit 1
fi
# The packaging script itself contains the detection patterns below; omit that
# source file from the content scan while scanning every other archived file.
if unzip -Z1 "$archive_path" \
  | while IFS= read -r entry; do
      [[ "$entry" == */scripts/package-cto-review.sh ]] && continue
      unzip -p "$archive_path" "$entry" 2>/dev/null || true
    done \
  | strings \
  | grep -Eiq 'incorainc\.com|gmail\.com|GOCSPX|AIzaSy|\+380|danylo\.karpa|tetiana\.stoyko|nadiia\.zakaliuzhna|bohdan\.vasylkiv'; then
  echo "Review archive contains unredacted personal data or secret material." >&2
  exit 1
fi

printf 'Created CTO review archive: %s (%s, %s files)\n' \
  "$archive_path" "$(du -h "$archive_path" | cut -f1)" "$(wc -l <<<"$entries")"
