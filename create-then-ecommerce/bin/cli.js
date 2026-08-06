#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import process from "node:process";

const TEMPLATE_REPO = "https://github.com/julianromli/then-ecommerce.git";
const TEMPLATE_REF = "main";
const DEFAULT_DEST = "then-ecommerce";
const CREATE_PACKAGE_DIR = "create-then-ecommerce";

const PURPLE = "\u001b[38;5;183m";
const CYAN = "\u001b[36m";
const DIM = "\u001b[2m";
const RESET = "\u001b[0m";
const BOLD = "\u001b[1m";

const MAYAR_BANNER = `
███╗   ███╗ █████╗ ██╗   ██╗ █████╗ ██████╗
████╗ ████║██╔══██╗╚██╗ ██╔╝██╔══██╗██╔══██╗
██╔████╔██║███████║ ╚████╔╝ ███████║██████╔╝
██║╚██╔╝██║██╔══██║  ╚██╔╝  ██╔══██║██╔══██╗
██║ ╚═╝ ██║██║  ██║   ██║   ██║  ██║██║  ██║
╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝
`.trimEnd();

function colorEnabled() {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

function paint(text, code) {
  if (!colorEnabled()) {
    return text;
  }
  return `${code}${text}${RESET}`;
}

function fail(message) {
  console.error(`create-then-ecommerce failed: ${message}`);
  process.exit(1);
}

function printBanner(showBanner) {
  if (!showBanner || !process.stdout.isTTY) {
    return;
  }

  console.log(paint(MAYAR_BANNER, PURPLE));
  console.log(
    paint("create then-ecommerce · scaffold", CYAN)
  );
  console.log();
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let destination = DEFAULT_DEST;
  let force = false;
  let showBanner = true;

  for (const arg of args) {
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "--no-banner") {
      showBanner = false;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg.startsWith("-")) {
      fail(`Unknown flag: ${arg}`);
    }
    destination = arg;
  }

  return { destination, force, showBanner };
}

function printHelp() {
  console.log(`Usage: create-then-ecommerce [destination] [options]

Options:
  --force       Overwrite an existing destination directory
  --no-banner   Skip the MAYAR ASCII banner
  -h, --help    Show this help

Environment (non-interactive):
  DATABASE_URL, MAYAR_ENVIRONMENT, MAYAR_API_KEY, UPLOADTHING_TOKEN,
  APP_URL, SHIPPING_FLAT_RATE, ADMIN_EMAIL, ADMIN_PASSWORD
  ADMIN_NAME is optional (derived from email when missing)
`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: options.env ?? process.env,
    cwd: options.cwd,
    shell: options.shell ?? false,
  });

  if (result.error) {
    fail(result.error.message);
  }

  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }
}

function commandExists(command) {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
    shell: false,
  });
  return result.status === 0;
}

function resolveDestination(destination) {
  return path.resolve(process.cwd(), destination);
}

function cloneTemplate(dest, force) {
  if (existsSync(dest)) {
    if (!force) {
      fail(
        `Destination already exists: ${dest}. Pass --force to overwrite.`
      );
    }
    rmSync(dest, { recursive: true, force: true });
  }

  mkdirSync(path.dirname(dest), { recursive: true });

  if (!commandExists("git")) {
    fail("git is required to clone the template repository");
  }

  console.log(`Cloning template from ${TEMPLATE_REPO}...`);
  run("git", [
    "clone",
    "--depth",
    "1",
    "--branch",
    TEMPLATE_REF,
    TEMPLATE_REPO,
    dest,
  ]);

  const nestedCreatePackage = path.join(dest, CREATE_PACKAGE_DIR);
  if (existsSync(nestedCreatePackage)) {
    rmSync(nestedCreatePackage, { recursive: true, force: true });
  }

  const gitDir = path.join(dest, ".git");
  if (existsSync(gitDir)) {
    rmSync(gitDir, { recursive: true, force: true });
  }
}

function createReadline() {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function ask(readline, label, defaultValue) {
  const suffix =
    defaultValue === undefined || defaultValue === ""
      ? ""
      : ` [${defaultValue}]`;
  const answer = (await readline.question(`${label}${suffix}: `)).trim();
  if (answer) {
    return answer;
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  return "";
}

async function askRequired(readline, label, defaultValue) {
  while (true) {
    const value = await ask(readline, label, defaultValue);
    if (value) {
      return value;
    }
    console.log("This value is required.");
  }
}

async function askMayarEnvironment(readline) {
  while (true) {
    console.log();
    console.log(paint("Select Mayar environment:", BOLD));
    console.log(`  ${paint("1. Sandbox", BOLD)}`);
    console.log(
      paint(
        "     Testing environment (recommended for first setup)",
        DIM
      )
    );
    console.log(`  ${paint("2. Production", BOLD)}`);
    console.log(
      paint(
        "     Live payments (only after sandbox checkout works)",
        DIM
      )
    );
    const pick = (
      await readline.question("Pick a number [1] (or q to quit): ")
    )
      .trim()
      .toLowerCase();

    if (pick === "" || pick === "1") {
      return "sandbox";
    }
    if (pick === "2") {
      return "production";
    }
    if (pick === "q") {
      console.log("Cancelled.");
      process.exit(1);
    }
    console.log("Enter 1, 2, or q.");
  }
}

function deriveAdminName(email) {
  const local = email.split("@")[0]?.trim();
  return local && local.length > 0 ? local : "Admin";
}

function escapeEnvValue(value) {
  if (/[\s#"']/.test(value)) {
    return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  }
  return value;
}

function writeEnvLocal(dest, values) {
  const lines = [
    `# Generated by create-then-ecommerce`,
    `DATABASE_URL=${escapeEnvValue(values.DATABASE_URL)}`,
    `BETTER_AUTH_SECRET=${escapeEnvValue(values.BETTER_AUTH_SECRET)}`,
    `APP_URL=${escapeEnvValue(values.APP_URL)}`,
    `MAYAR_ENVIRONMENT=${escapeEnvValue(values.MAYAR_ENVIRONMENT)}`,
    `MAYAR_API_KEY=${escapeEnvValue(values.MAYAR_API_KEY)}`,
    `UPLOADTHING_TOKEN=${escapeEnvValue(values.UPLOADTHING_TOKEN)}`,
    `SHIPPING_FLAT_RATE=${escapeEnvValue(values.SHIPPING_FLAT_RATE)}`,
    "",
  ];

  writeFileSync(path.join(dest, ".env.local"), lines.join("\n"), {
    mode: 0o600,
  });
}

async function collectInteractiveConfig() {
  const readline = createReadline();

  try {
    const DATABASE_URL = await askRequired(
      readline,
      "DATABASE_URL (Neon Postgres connection string)"
    );
    const MAYAR_ENVIRONMENT = await askMayarEnvironment(readline);
    const MAYAR_API_KEY = await askRequired(
      readline,
      `MAYAR_API_KEY (${MAYAR_ENVIRONMENT} key from Mayar dashboard)`
    );
    const UPLOADTHING_TOKEN = await askRequired(
      readline,
      "UPLOADTHING_TOKEN"
    );
    const APP_URL = await askRequired(
      readline,
      "APP_URL",
      "http://localhost:3000"
    );
    const SHIPPING_FLAT_RATE = await ask(
      readline,
      "SHIPPING_FLAT_RATE",
      "0"
    );
    const ADMIN_EMAIL = await askRequired(readline, "Admin email");
    let ADMIN_PASSWORD = "";
    while (ADMIN_PASSWORD.length < 8) {
      ADMIN_PASSWORD = await askRequired(
        readline,
        "Admin password (min 8 characters)"
      );
      if (ADMIN_PASSWORD.length < 8) {
        console.log("Password must be at least 8 characters.");
      }
    }

    return {
      DATABASE_URL,
      MAYAR_ENVIRONMENT,
      MAYAR_API_KEY,
      UPLOADTHING_TOKEN,
      APP_URL,
      SHIPPING_FLAT_RATE: SHIPPING_FLAT_RATE || "0",
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_NAME: deriveAdminName(ADMIN_EMAIL),
    };
  } finally {
    readline.close();
  }
}

function collectEnvConfig() {
  const DATABASE_URL = process.env.DATABASE_URL;
  const MAYAR_API_KEY = process.env.MAYAR_API_KEY;
  const UPLOADTHING_TOKEN = process.env.UPLOADTHING_TOKEN;
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  let MAYAR_ENVIRONMENT = (
    process.env.MAYAR_ENVIRONMENT ?? "sandbox"
  ).toLowerCase();

  if (!(DATABASE_URL && MAYAR_API_KEY && UPLOADTHING_TOKEN)) {
    fail(
      "Non-interactive mode requires DATABASE_URL, MAYAR_API_KEY, and UPLOADTHING_TOKEN"
    );
  }
  if (!(ADMIN_EMAIL && ADMIN_PASSWORD)) {
    fail(
      "Non-interactive mode requires ADMIN_EMAIL and ADMIN_PASSWORD"
    );
  }
  if (ADMIN_PASSWORD.length < 8) {
    fail("ADMIN_PASSWORD must be at least 8 characters");
  }
  if (MAYAR_ENVIRONMENT !== "sandbox" && MAYAR_ENVIRONMENT !== "production") {
    fail("MAYAR_ENVIRONMENT must be sandbox or production");
  }

  return {
    DATABASE_URL,
    MAYAR_ENVIRONMENT,
    MAYAR_API_KEY,
    UPLOADTHING_TOKEN,
    APP_URL: process.env.APP_URL ?? "http://localhost:3000",
    SHIPPING_FLAT_RATE: process.env.SHIPPING_FLAT_RATE ?? "0",
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    ADMIN_NAME: process.env.ADMIN_NAME ?? deriveAdminName(ADMIN_EMAIL),
  };
}

function installDependencies(dest) {
  console.log();
  console.log("Installing dependencies with bun...");
  if (!commandExists("bun")) {
    fail("Bun is required. Install Bun 1.3+ then re-run this command.");
  }
  run("bun", ["install"], { cwd: dest });
}

function runSetup(dest, config, authSecret) {
  console.log();
  console.log("Running bun setup...");
  run("bun", ["setup"], {
    cwd: dest,
    env: {
      ...process.env,
      DATABASE_URL: config.DATABASE_URL,
      BETTER_AUTH_SECRET: authSecret,
      APP_URL: config.APP_URL,
      MAYAR_ENVIRONMENT: config.MAYAR_ENVIRONMENT,
      MAYAR_API_KEY: config.MAYAR_API_KEY,
      UPLOADTHING_TOKEN: config.UPLOADTHING_TOKEN,
      SHIPPING_FLAT_RATE: config.SHIPPING_FLAT_RATE,
      ADMIN_EMAIL: config.ADMIN_EMAIL,
      ADMIN_NAME: config.ADMIN_NAME,
      ADMIN_PASSWORD: config.ADMIN_PASSWORD,
    },
  });
}

function printNextSteps(dest, config, authSecret) {
  const rel =
    path.relative(process.cwd(), dest) || path.basename(dest);

  console.log();
  console.log(paint("Scaffold complete.", BOLD));
  console.log();
  console.log("Next steps:");
  console.log(`  cd ${rel}`);
  console.log("  bun dev");
  console.log();
  console.log("Deploy to Vercel:");
  console.log("  1. Import the project (or push to GitHub and use the Deploy Button).");
  console.log("  2. Copy these env vars into the Vercel project settings:");
  console.log("     DATABASE_URL, BETTER_AUTH_SECRET, MAYAR_ENVIRONMENT,");
  console.log("     MAYAR_API_KEY, UPLOADTHING_TOKEN, SHIPPING_FLAT_RATE");
  console.log("  3. After the first deploy, set APP_URL to your public URL.");
  console.log("  4. Re-run bun setup against the production database if needed,");
  console.log("     then register the Mayar webhook:");
  console.log(
    `     npx -y mayar@latest webhook register ${config.APP_URL.replace(/\/$/, "")}/api/webhooks/mayar`
  );
  console.log();
  console.log(
    paint(
      "BETTER_AUTH_SECRET was generated for this project. Keep it private.",
      DIM
    )
  );
  console.log(paint(`  BETTER_AUTH_SECRET=${authSecret}`, DIM));
}

async function main() {
  const { destination, force, showBanner } = parseArgs(process.argv);
  printBanner(showBanner);

  const dest = resolveDestination(destination);
  const interactive = Boolean(process.stdin.isTTY);

  let config;
  if (interactive) {
    const dirAnswer = await (async () => {
      const readline = createReadline();
      try {
        return await ask(
          readline,
          "Project directory",
          path.basename(dest) === destination
            ? destination
            : path.basename(dest)
        );
      } finally {
        readline.close();
      }
    })();

    const finalDest = resolveDestination(dirAnswer || destination);
    cloneTemplate(finalDest, force);
    config = await collectInteractiveConfig();
    const authSecret = randomBytes(32).toString("base64url");
    writeEnvLocal(finalDest, {
      ...config,
      BETTER_AUTH_SECRET: authSecret,
    });
    console.log("Wrote .env.local (BETTER_AUTH_SECRET generated).");
    installDependencies(finalDest);
    runSetup(finalDest, config, authSecret);
    printNextSteps(finalDest, config, authSecret);
    return;
  }

  config = collectEnvConfig();
  cloneTemplate(dest, force);
  const authSecret =
    process.env.BETTER_AUTH_SECRET ??
    randomBytes(32).toString("base64url");
  writeEnvLocal(dest, {
    ...config,
    BETTER_AUTH_SECRET: authSecret,
  });
  installDependencies(dest);
  runSetup(dest, config, authSecret);
  printNextSteps(dest, config, authSecret);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
