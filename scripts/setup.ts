import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Prepares a local development environment.
 *
 * This script only does the work that needs a terminal: write .dev.vars, mint
 * secrets, and apply migrations to the local D1. Creating the administrator and
 * seeding the catalogue happen at /setup, so that one-click deploys and local
 * clones follow the same path. See ADR-0014.
 */

const ENV_PATH = ".dev.vars";
const SETUP_TOKEN_LINE = /^SETUP_TOKEN=(.+)$/m;

function fail(message: string): never {
  console.error(`Setup failed: ${message}`);
  process.exit(1);
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit" });

  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }
}

function readDevVars() {
  return existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
}

function hasKey(contents: string, key: string) {
  return new RegExp(`^${key}=.+$`, "m").test(contents);
}

function appendKey(key: string, value: string) {
  const current = readDevVars();
  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";

  writeFileSync(ENV_PATH, `${current}${separator}${key}=${value}\n`, {
    mode: 0o600,
  });
  console.log(`Generated ${key} in ${ENV_PATH}`);
}

function ensureSecrets() {
  const contents = readDevVars();

  if (!hasKey(contents, "BETTER_AUTH_SECRET")) {
    appendKey("BETTER_AUTH_SECRET", randomBytes(32).toString("base64url"));
  }

  if (!hasKey(readDevVars(), "SETUP_TOKEN")) {
    appendKey("SETUP_TOKEN", randomBytes(24).toString("base64url"));
  }
}

function reportMissing() {
  const contents = readDevVars();
  const missing = ["MAYAR_API_KEY"].filter((key) => !hasKey(contents, key));

  if (missing.length > 0) {
    console.log(
      `\nAdd these to ${ENV_PATH} before checkout will work: ${missing.join(", ")}`
    );
  }
}

function printNextSteps() {
  const token =
    readDevVars().match(SETUP_TOKEN_LINE)?.[1] ?? "your setup token";

  console.log("\nSetup complete. Next steps:");
  console.log("  1. bun dev");
  console.log("  2. Open http://localhost:3000/setup");
  console.log(`  3. Use this setup token: ${token}`);
  console.log(
    "\nThe setup page creates your administrator, seeds the catalogue, and"
  );
  console.log("shows the Mayar webhook URL to register.");
}

function main() {
  ensureSecrets();
  run("bunx", ["wrangler", "d1", "migrations", "apply", "DB", "--local"]);
  reportMissing();
  printNextSteps();
}

main();
