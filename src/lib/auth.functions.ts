import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { getAuth, getFreshSession } from "./auth";

export const getSession = createServerFn({ method: "GET" }).handler(() => {
  const headers = getRequestHeaders();

  return getAuth().api.getSession({ headers });
});

export const ensureSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await getSession();

    if (!session) {
      throw new Error("Unauthorized");
    }

    return session;
  }
);

export const ensureAdmin = createServerFn({ method: "GET" }).handler(
  async () => {
    // The role decides this, so the cookie cache is bypassed. See ADR-0014.
    const session = await getFreshSession(getRequestHeaders());

    if (!session) {
      throw new Error("Unauthorized");
    }

    if (session.user.role !== "admin") {
      throw new Error("Forbidden");
    }

    return session;
  }
);
