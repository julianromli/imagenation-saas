import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { ensureAdmin } from "@/lib/auth.functions";
import { getRuntimeEnv } from "@/lib/runtime-env";
import {
  ONBOARDING_DISMISSED_KEY,
  readSetupValue,
  readWebhookSecret,
  writeSetupValue,
} from "@/lib/setup-metadata";

export const getAppOnboarding = createServerFn({ method: "GET" }).handler(
  async () => {
    await ensureAdmin();

    const [dismissed, webhookSecret] = await Promise.all([
      readSetupValue(ONBOARDING_DISMISSED_KEY),
      readWebhookSecret(),
    ]);

    const env = getRuntimeEnv();
    const { origin } = new URL(getRequest().url);

    return {
      dismissed: dismissed !== null,
      livePayments: env.MAYAR_ENVIRONMENT === "production",
      publicUrl: Boolean(env.BETTER_AUTH_URL),
      webhookUrl: webhookSecret
        ? `${origin}/api/webhooks/mayar/${webhookSecret}`
        : null,
    };
  }
);

export const dismissAppOnboarding = createServerFn({
  method: "POST",
}).handler(async () => {
  await ensureAdmin();

  await writeSetupValue(ONBOARDING_DISMISSED_KEY, {
    dismissedAt: new Date().toISOString(),
  });
});
