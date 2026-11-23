import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const originHost = process.env.INCORA_HOST ?? "127.0.0.1";
const originPort = process.env.INCORA_PORT ?? "3000";
const urlFile = process.env.INCORA_TUNNEL_URL_FILE
  ?? "/run/user/1000/incora-people-tunnel-url";

const child = spawn("/usr/bin/ssh", [
  "-T",
  "-o", "BatchMode=yes",
  "-o", "ExitOnForwardFailure=yes",
  "-o", "StrictHostKeyChecking=yes",
  "-o", "ServerAliveInterval=30",
  "-o", "ServerAliveCountMax=3",
  "-R", `80:${originHost}:${originPort}`,
  "nokey@localhost.run",
], {
  stdio: ["ignore", "pipe", "pipe"],
});

let publishedUrl = "";

async function inspect(chunk, output) {
  const text = chunk.toString();
  output.write(text);
  const match = text.match(/https:\/\/[a-z0-9-]+\.(?:lhr\.life|lhr\.rocks)/i);
  if (match && match[0] !== publishedUrl) {
    publishedUrl = match[0];
    await writeFile(urlFile, `${publishedUrl}\n`, { encoding: "utf8", mode: 0o600 });
    console.log(`public url: ${publishedUrl}`);
  }
}

child.stdout.on("data", (chunk) => {
  void inspect(chunk, process.stdout);
});
child.stderr.on("data", (chunk) => {
  void inspect(chunk, process.stderr);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

const exitCode = await new Promise((resolve) => {
  child.once("error", (error) => {
    console.error(error);
    resolve(1);
  });
  child.once("exit", (code, signal) => {
    if (signal) console.error(`SSH tunnel exited after ${signal}`);
    resolve(code ?? 1);
  });
});

process.exitCode = exitCode;
