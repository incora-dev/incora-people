import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig(async ({ mode }) => {
  const deploymentEnv = loadEnv(mode, process.cwd(), "");
  const databaseId =
    deploymentEnv.CLOUDFLARE_D1_DATABASE_ID ||
    SITE_CREATOR_PLACEHOLDER_DATABASE_ID;
  const bindingConfig = {
    main: "./worker/index.ts",
    compatibility_flags: ["nodejs_compat"],
    vars: {
      APP_MODE: deploymentEnv.APP_MODE || "protected",
      DEMO_USER_EMAIL: deploymentEnv.DEMO_USER_EMAIL || "",
      ALLOWED_EMAIL_DOMAIN: deploymentEnv.ALLOWED_EMAIL_DOMAIN || "*",
      CF_ACCESS_TEAM_DOMAIN: deploymentEnv.CF_ACCESS_TEAM_DOMAIN || "",
      CF_ACCESS_AUD: deploymentEnv.CF_ACCESS_AUD || "",
      AUTH_PROVIDER: deploymentEnv.AUTH_PROVIDER || "cloudflare",
      GOOGLE_CLIENT_ID: deploymentEnv.GOOGLE_CLIENT_ID || "",
      CHROME_EXTENSION_ID: deploymentEnv.CHROME_EXTENSION_ID || "",
      PUBLIC_APP_URL:
        deploymentEnv.PUBLIC_APP_URL ||
        "https://incora-people.incora-people.workers.dev",
    },
    d1_databases: d1
      ? [
          {
            binding: d1,
            database_name: "incora-people",
            database_id: databaseId,
            // vinext emits Wrangler's config into dist/server. Wrangler resolves
            // this path from that generated config, not from the repository root.
            migrations_dir: "../../migrations",
          },
        ]
      : [],
    r2_buckets: r2
      ? [
          {
            binding: r2,
            bucket_name: "incora-people-files",
          },
        ]
      : [],
    triggers: {
      crons: ["*/5 * * * *"],
    },
  };

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      allowedHosts: [".loca.lt"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: bindingConfig,
      }),
    ],
  };
});
