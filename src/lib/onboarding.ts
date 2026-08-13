/**
 * Which of the first-run steps the operator has finished.
 *
 * Kept on the server rather than in the browser, because the operator who
 * deploys from a laptop and finishes on a phone is the same person doing one
 * job. There is exactly one app per deploy, so one row holds it.
 *
 * Nothing here may carry a secret. Until setup completes, the guide this feeds
 * is readable by anyone who finds the URL.
 */

import { SERVER_COMPLETED_STEP, setupGuideStepIds } from "@/lib/setup-guide";
import {
  ONBOARDING_KEY,
  readSetupValue,
  writeSetupValue,
} from "@/lib/setup-metadata";

export type OnboardingState = {
  /** Step ids finished, in no particular order. */
  done: string[];
  /** Whether the guide should be rendered for this viewer at all. */
  show: boolean;
};

/**
 * Reads the stored ids, dropping any that no longer exist.
 *
 * A step removed from the guide leaves its id behind in the row. Filtering on
 * read means the count of finished steps can never exceed the count of steps,
 * so "6 of 6" cannot appear while something is still outstanding.
 */
export async function readFinishedSteps() {
  const stored = await readSetupValue(ONBOARDING_KEY);
  const raw = typeof stored?.done === "string" ? stored.done : "";

  return raw.split(",").filter((id) => setupGuideStepIds.includes(id));
}

export function writeFinishedSteps(ids: string[]) {
  // Sorted and de-duplicated so the row does not churn on a repeated tick.
  const unique = [...new Set(ids)].sort();

  return writeSetupValue(ONBOARDING_KEY, { done: unique.join(",") });
}

/**
 * Adds `/setup` to whatever the operator has ticked by hand.
 *
 * Derived rather than written, so it stays true even if the row is missing,
 * and so nothing has to remember to write it at the moment setup finishes.
 */
export function withServerKnownSteps(done: string[], setupComplete: boolean) {
  return setupComplete ? [...new Set([...done, SERVER_COMPLETED_STEP])] : done;
}

export function isOnboardingFinished(done: string[]) {
  return setupGuideStepIds.every((id) => done.includes(id));
}

/**
 * Decides who sees the guide.
 *
 * Before setup, anybody: no account exists yet, so whoever is looking at a
 * blank deploy is the operator. After setup, administrators only, and only
 * until the last step is ticked — five of the six steps still matter once an
 * administrator exists, and somebody buying credits should never read them.
 */
export function shouldShowOnboarding({
  done,
  isAdmin,
  setupComplete,
}: {
  done: string[];
  isAdmin: boolean;
  setupComplete: boolean;
}) {
  if (!setupComplete) {
    return true;
  }

  return isAdmin && !isOnboardingFinished(done);
}
