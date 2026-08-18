import { readSetupValue, SETUP_COMPLETED_KEY } from "@/lib/setup-metadata";

/**
 * Held for the life of the isolate once it is true.
 *
 * Setup completion is a one-way door, which is what makes the cache safe. A
 * `false` is never held: an isolate that read one before setup finished would
 * otherwise keep offering the setup page for as long as it lived.
 */
let setupCompleted = false;

export async function isSetupComplete() {
  if (setupCompleted) {
    return true;
  }

  const complete = (await readSetupValue(SETUP_COMPLETED_KEY)) !== null;

  if (complete) {
    setupCompleted = true;
  }

  return complete;
}
