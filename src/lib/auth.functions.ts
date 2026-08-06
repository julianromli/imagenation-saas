import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { auth } from "./auth";

export const getSession = createServerFn({ method: "GET" }).handler(() => {
  const headers = getRequestHeaders();

  return auth.api.getSession({ headers });
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
    const session = await ensureSession();

    if (session.user.role !== "admin") {
      throw new Error("Forbidden");
    }

    return session;
  }
);
