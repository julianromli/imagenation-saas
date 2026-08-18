import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Prepares a local development environment.
 *
 * This script only does the work that needs a terminal: prune keys the app no
 * longer reads from `.dev.vars` and apply migrations to the local D1. The
 * Worker mints `BETTER_AUTH_SECRET` itself on first use (ADR-0023), and
 * creating the administrator happens at `/setup`, so that one-click deploys
 * and local clones follow the same path. See ADR-0022.
 */

const ENV_PATH = ".dev.vars";

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

function removeKey(key: string) {
  const current = readDevVars();
  const next = current.replace(new RegExp(`^${key}=.*\\n?`, "m"), "");

  if (next === current) {
    return;
  }

  writeFileSync(ENV_PATH, next, { mode: 0o600 });
  chmodSync(ENV_PATH, 0o600);
  console.log(`Removed unused ${key} from ${ENV_PATH}`);
}

function removeUnusedKeys() {
  removeKey("SETUP_TOKEN");
  // The Worker mints this itself now. See ADR-0023.
  removeKey("BETTER_AUTH_SECRET");
}

function reportMissing() {
  const contents = readDevVars();
  const missing = ["OPENROUTER_API_KEY", "MAYAR_API_KEY"].filter(
    (key) => !hasKey(contents, key)
  );

  if (missing.length > 0) {
    console.log(
      `\nAdd these to ${ENV_PATH} before the app can work: ${missing.join(", ")}.\nOPENROUTER_API_KEY generates images. MAYAR_API_KEY sells credits.`
    );
  }
}

function printNextSteps() {
  console.log("\nSetup complete. Next steps:");
  console.log("  1. bun dev");
  console.log(
    "  2. Open http://localhost:3000 — the home page sends you to /setup"
  );
  console.log(
    "\nThe setup page creates your administrator, checks your OpenRouter key,"
  );
  console.log("and shows the Mayar webhook URL to register.");
}

function main() {
  removeUnusedKeys();
  run("bunx", ["wrangler", "d1", "migrations", "apply", "DB", "--local"]);
  reportMissing();
  printNextSteps();
}

main();
