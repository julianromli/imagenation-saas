import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

import dotenv from "dotenv";
import { eq } from "drizzle-orm";

dotenv.config();
dotenv.config({ path: ".env.local" });

const authSecretPattern = /(^|\n)BETTER_AUTH_SECRET=.*(?=\n|$)/;

function fail(message: string): never {
  console.error(`Setup failed: ${message}`);
  process.exit(1);
}

function run(command: string, args: string[], env = process.env) {
  const result = spawnSync(command, args, {
    env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }
}

function ensureAuthSecret() {
  if (process.env.BETTER_AUTH_SECRET) {
    return;
  }

  const secret = randomBytes(32).toString("base64url");
  const envPath = ".env.local";
  const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const line = `BETTER_AUTH_SECRET=${secret}`;
  const updated = authSecretPattern.test(current)
    ? current.replace(authSecretPattern, `$1${line}`)
    : `${current.trimEnd()}${current.trimEnd() ? "\n" : ""}${line}\n`;

  writeFileSync(envPath, updated, { mode: 0o600 });

  process.env.BETTER_AUTH_SECRET = secret;
  console.log("Generated BETTER_AUTH_SECRET in .env.local");
}

function deriveAdminName(email: string) {
  const local = email.split("@")[0]?.trim();
  return local && local.length > 0 ? local : "Admin";
}

async function promptAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName =
    process.env.ADMIN_NAME ??
    (adminEmail ? deriveAdminName(adminEmail) : undefined);

  if (adminEmail && adminName && adminPassword) {
    return { adminEmail, adminName, adminPassword };
  }

  if (!process.stdin.isTTY) {
    console.log(
      "Skipping admin bootstrap. Set ADMIN_EMAIL and ADMIN_PASSWORD for CI (ADMIN_NAME optional)."
    );
    return null;
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const email = adminEmail ?? (await readline.question("Admin email: "));
    let password = adminPassword ?? "";
    if (!password) {
      password = await readline.question("Admin password (min 8 characters): ");
    }

    if (!email || password.length < 8) {
      fail(
        "Admin email is required and password must be at least 8 characters"
      );
    }

    return {
      adminEmail: email,
      adminName: adminName ?? deriveAdminName(email),
      adminPassword: password,
    };
  } finally {
    readline.close();
  }
}

async function bootstrapAdmin() {
  const input = await promptAdmin();

  if (!input) {
    return;
  }

  const [{ auth }, { getDb }, { users }] = await Promise.all([
    import("../src/lib/auth"),
    import("../src/db"),
    import("../src/db/schema"),
  ]);
  const db = getDb();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, input.adminEmail))
    .limit(1);

  if (!existing[0]) {
    await auth.api.signUpEmail({
      body: {
        email: input.adminEmail,
        name: input.adminName,
        password: input.adminPassword,
      },
    });
  }

  await db
    .update(users)
    .set({ role: "admin", updatedAt: new Date() })
    .where(eq(users.email, input.adminEmail));

  console.log(`Admin ready: ${input.adminEmail}`);
}

function validateMayar() {
  if (process.env.SETUP_SKIP_MAYAR === "1") {
    console.log("Skipping Mayar validation because SETUP_SKIP_MAYAR=1");
    return;
  }

  if (!process.env.MAYAR_API_KEY) {
    fail(
      "Set MAYAR_API_KEY or use SETUP_SKIP_MAYAR=1 for a database-only setup"
    );
  }

  const environment = process.env.MAYAR_ENVIRONMENT ?? "sandbox";
  const mayarEnv = {
    ...process.env,
    MAYAR_API_KEY: process.env.MAYAR_API_KEY,
    NODE_ENV: environment === "sandbox" ? "development" : "production",
  };

  run("npx", ["-y", "mayar@latest", "whoami", "--json"], mayarEnv);

  if (process.env.APP_URL) {
    run(
      "npx",
      [
        "-y",
        "mayar@latest",
        "webhook",
        "register",
        `${process.env.APP_URL}/api/webhooks/mayar`,
      ],
      mayarEnv
    );
  } else {
    console.log("APP_URL is not set; register the Mayar webhook manually.");
  }
}

function printNextSteps() {
  console.log("Setup complete");
  console.log();
  console.log("Next steps:");
  console.log("  bun dev");
  console.log();
  console.log("After the first Vercel deploy:");
  console.log("  1. Set APP_URL to your public deployment URL.");
  console.log("  2. Ensure BETTER_AUTH_SECRET matches this environment.");
  console.log("  3. Register the Mayar webhook:");
  console.log(
    "     npx -y mayar@latest webhook register https://your-domain.example/api/webhooks/mayar"
  );
  console.log(
    "  4. Keep MAYAR_ENVIRONMENT=sandbox until checkout is verified."
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    fail("Set DATABASE_URL to a Neon Postgres connection string");
  }

  ensureAuthSecret();
  run("bun", ["x", "drizzle-kit", "migrate"]);
  const { seedDatabase } = await import("../src/db/seed");
  await seedDatabase();
  await bootstrapAdmin();
  validateMayar();
  printNextSteps();
}

await main();
