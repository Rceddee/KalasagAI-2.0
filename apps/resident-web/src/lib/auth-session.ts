const INVALID_SESSION_CODES = new Set([
  "bad_jwt",
  "refresh_token_already_used",
  "refresh_token_not_found",
  "session_expired",
  "session_not_found",
  "user_not_found",
]);

export function isInvalidAuthSessionError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const status = "status" in error ? error.status : undefined;
  const code = "code" in error ? error.code : undefined;

  return status === 401 ||
    (typeof code === "string" && INVALID_SESSION_CODES.has(code));
}
