const LEGACY_THEME_PREFIX = "/themes/fuyukawa-kagari";
const LEGACY_GAMES_PREFIX = `${LEGACY_THEME_PREFIX}/games`;

export function getCanonicalPath(pathname: string) {
  const normalized = pathname
    ? pathname.startsWith("/") ? pathname : `/${pathname}`
    : "/";

  // Games has no root-route counterpart; keep the historical page canonical at its live URL.
  if (normalized === LEGACY_GAMES_PREFIX || normalized.startsWith(`${LEGACY_GAMES_PREFIX}/`)) {
    return normalized;
  }

  if (normalized === LEGACY_THEME_PREFIX || normalized === `${LEGACY_THEME_PREFIX}/`) return "/";
  if (normalized.startsWith(`${LEGACY_THEME_PREFIX}/`)) {
    return normalized.slice(LEGACY_THEME_PREFIX.length) || "/";
  }

  return normalized;
}
