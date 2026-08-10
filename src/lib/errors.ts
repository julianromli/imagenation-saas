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

/** Not enough credits. The same request succeeds after a top-up. */
export class InsufficientCreditsError extends Error {
  readonly status = 402;

  constructor(message: string) {
    super(message);
    this.name = "InsufficientCreditsError";
  }
}

/** The account already has work in flight, or is locked out. */
export class ConflictError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** The account is allowed in but not allowed to do this. */
export class ForbiddenError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type HttpError =
  | ConflictError
  | ForbiddenError
  | InsufficientCreditsError
  | InvalidRequestError
  | RateLimitError;

export function isHttpError(error: unknown): error is HttpError {
  return (
    error instanceof ConflictError ||
    error instanceof ForbiddenError ||
    error instanceof InsufficientCreditsError ||
    error instanceof InvalidRequestError ||
    error instanceof RateLimitError
  );
}
