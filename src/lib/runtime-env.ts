import { env as cloudflareEnv } from "./cloudflare-env";

export type MayarEnvironment = "sandbox" | "production";

export type RuntimeEnv = {
  BETTER_AUTH_URL?: string;
  MAYAR_API_KEY?: string;
  MAYAR_ENV?: MayarEnvironment;
  MAYAR_ENVIRONMENT?: MayarEnvironment;
  OPENROUTER_API_KEY?: string;
};

// Node tooling reads process.env. The Worker reads its own bindings. Values
// are strings in both, so the lookup is shared.
const processEnv =
  typeof process === "undefined" ? {} : (process.env as RuntimeEnv);

function value(name: keyof RuntimeEnv) {
  return (
    processEnv[name] ??
    (cloudflareEnv as Record<string, string | undefined>)[name]
  );
}

export function getRuntimeEnv(): RuntimeEnv {
  const environment = value("MAYAR_ENVIRONMENT") ?? value("MAYAR_ENV");

  return {
    BETTER_AUTH_URL: value("BETTER_AUTH_URL"),
    MAYAR_API_KEY: value("MAYAR_API_KEY"),
    MAYAR_ENVIRONMENT: environment === "production" ? "production" : "sandbox",
    OPENROUTER_API_KEY: value("OPENROUTER_API_KEY"),
  };
}

export function requireEnv<K extends keyof RuntimeEnv>(name: K): string {
  const runtimeValue = getRuntimeEnv()[name];

  if (!runtimeValue) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return runtimeValue;
}

/**
 * The public origin. A one-click deploy does not know its own URL until the
 * deploy finishes, so the request origin is the source of truth. See ADR-0014.
 */
export function getAppUrl(request?: Request) {
  return request ? new URL(request.url).origin : "http://localhost:3000";
}
