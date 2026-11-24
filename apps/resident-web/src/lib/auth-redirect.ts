const DEFAULT_AUTH_REDIRECT_PATH = "/report";

export function getSafeAuthRedirectPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") ||
    Array.from(next).some((character) => character.charCodeAt(0) < 32)) {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }
  return next;
}
