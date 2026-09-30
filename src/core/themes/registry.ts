const LEGACY_THEME_PREFIX = "/themes/fuyukawa-kagari";

export function getCanonicalPath(pathname: string) {
  const normalized = pathname
    ? pathname.startsWith("/") ? pathname : `/${pathname}`
    : "/";

  if (normalized === LEGACY_THEME_PREFIX || normalized === `${LEGACY_THEME_PREFIX}/`) return "/";
  if (normalized.startsWith(`${LEGACY_THEME_PREFIX}/`)) {
    return normalized.slice(LEGACY_THEME_PREFIX.length) || "/";
  }

  return normalized;
}
