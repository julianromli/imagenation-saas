import { env as cloudflareEnv } from "./cloudflare-env";

export type MayarEnvironment = "sandbox" | "production";

export type RuntimeEnv = {
  APP_URL?: string;
  BETTER_AUTH_SECRET?: string;
  DATABASE_URL?: string;
  MAYAR_API_KEY?: string;
  MAYAR_ENV?: MayarEnvironment;
  MAYAR_ENVIRONMENT?: MayarEnvironment;
  SHIPPING_FLAT_RATE?: string;
  UPLOADTHING_TOKEN?: string;
};

const processEnv =
  typeof process === "undefined" ? {} : (process.env as RuntimeEnv);

function value(name: keyof RuntimeEnv) {
  return processEnv[name] ?? cloudflareEnv[name];
}

export function getRuntimeEnv(): RuntimeEnv {
  const environment = value("MAYAR_ENVIRONMENT") ?? value("MAYAR_ENV");

  return {
    APP_URL: value("APP_URL"),
    BETTER_AUTH_SECRET: value("BETTER_AUTH_SECRET"),
    DATABASE_URL: value("DATABASE_URL"),
    MAYAR_API_KEY: value("MAYAR_API_KEY"),
    MAYAR_ENVIRONMENT: environment === "production" ? "production" : "sandbox",
    SHIPPING_FLAT_RATE: value("SHIPPING_FLAT_RATE"),
    UPLOADTHING_TOKEN: value("UPLOADTHING_TOKEN"),
  };
}

export function requireEnv<K extends keyof RuntimeEnv>(name: K): string {
  const runtimeValue = getRuntimeEnv()[name];

  if (!runtimeValue) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return runtimeValue;
}

export function getShippingFlatRate() {
  const shippingRate = Number(getRuntimeEnv().SHIPPING_FLAT_RATE ?? 0);

  return Number.isSafeInteger(shippingRate) && shippingRate >= 0
    ? shippingRate
    : 0;
}

export function getAppUrl(request?: Request) {
  return (
    getRuntimeEnv().APP_URL ??
    (request ? new URL(request.url).origin : "http://localhost:3000")
  );
}
