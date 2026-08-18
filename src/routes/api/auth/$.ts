import { createFileRoute } from "@tanstack/react-router";

import { getAuth } from "@/lib/auth";
import { isSetupComplete } from "@/lib/setup-status";

function isClosedUntilSetup(pathname: string) {
  return (
    pathname.endsWith("/sign-in/email") || pathname.endsWith("/sign-up/email")
  );
}

async function handleAuth(request: Request) {
  const { pathname } = new URL(request.url);

  if (isClosedUntilSetup(pathname) && !(await isSetupComplete())) {
    return Response.json(
      { message: "Complete setup before you sign in or create an account." },
      { status: 403 }
    );
  }

  return (await getAuth()).handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuth(request),
      POST: ({ request }) => handleAuth(request),
    },
  },
});
