export function isLocalApiTarget(apiUrl: string | undefined, appOrigin: string): boolean {
  const target = apiUrl?.trim();
  if (!target) return true;

  try {
    const hostname = new URL(target, appOrigin).hostname.toLocaleLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    // An invalid configured API is never trusted as a dev-login target.
    return false;
  }
}
