/**
 * Errors that carry an HTTP meaning.
 *
 * Server functions surface the message and nothing else, so these types exist
 * for the raw route handlers in `src/routes/api`. Without them a refused rate
 * limit and a genuine failure both leave as 500, and a client cannot tell a
 * request worth retrying from one that is simply wrong.
 */

/** The caller sent something invalid. Retrying it unchanged will not help. */
export class InvalidRequestError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "InvalidRequestError";
  }
}

/** The caller is over a rate limit. The same request may succeed later. */
export class RateLimitError extends Error {
  readonly status = 429;

  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}
