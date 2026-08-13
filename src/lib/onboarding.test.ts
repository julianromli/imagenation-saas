import { describe, expect, it } from "vitest";

import {
  isOnboardingFinished,
  shouldShowOnboarding,
  withServerKnownSteps,
} from "./onboarding";
import { setupGuideStepIds } from "./setup-guide";

describe("who sees the setup guide", () => {
  it("shows it to anybody before setup", () => {
    // No account exists yet, so whoever is looking at a blank deploy is the
    // operator. There is nobody else it could be.
    expect(
      shouldShowOnboarding({ done: [], isAdmin: false, setupComplete: false })
    ).toBe(true);
  });

  it("hides it from a signed-in customer once setup is done", () => {
    expect(
      shouldShowOnboarding({
        done: ["administrator"],
        isAdmin: false,
        setupComplete: true,
      })
    ).toBe(false);
  });

  it("keeps showing it to the administrator until the last step", () => {
    expect(
      shouldShowOnboarding({
        done: ["administrator"],
        isAdmin: true,
        setupComplete: true,
      })
    ).toBe(true);
  });

  it("stops for good once every step is ticked", () => {
    expect(
      shouldShowOnboarding({
        done: setupGuideStepIds,
        isAdmin: true,
        setupComplete: true,
      })
    ).toBe(false);
  });
});

describe("counting finished steps", () => {
  it("ticks the setup step from the server, not from the operator", () => {
    expect(withServerKnownSteps([], true)).toEqual(["administrator"]);
    expect(withServerKnownSteps([], false)).toEqual([]);
  });

  it("does not tick it twice", () => {
    expect(withServerKnownSteps(["administrator"], true)).toEqual([
      "administrator",
    ]);
  });

  it("is unfinished while anything is outstanding", () => {
    expect(isOnboardingFinished(setupGuideStepIds.slice(0, -1))).toBe(false);
    expect(isOnboardingFinished(setupGuideStepIds)).toBe(true);
  });

  it("is not finished by an id that no longer exists", () => {
    expect(isOnboardingFinished(["a-step-we-deleted"])).toBe(false);
  });
});
