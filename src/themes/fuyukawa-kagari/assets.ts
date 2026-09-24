const themeRoot = "/themes/fuyukawa-kagari";

export function kagariAsset(path: string) {
  return `${themeRoot}/assets/${path.replace(/^\/+/, "")}`;
}

export const kagariAssets = {
  favicon: kagariAsset("kanade_c.png"),
  appleTouchIcon: kagariAsset("avatar-sigil.png"),
  profile: kagariAsset("profile.webp"),
  heroWallpaper: kagariAsset("hero-wallpaper.webp"),
  mobileHeroWallpaper: kagariAsset("hero-wallpaper-mobile.webp"),
  mobileHeroManga: kagariAsset("manga/hero-manga-mobile.webp"),
  pageBackground: kagariAsset("fuyukawa-kagari-bg.webp"),
  notFound: kagariAsset("legacy/404.webp"),
  musicManifest: `${themeRoot}/music/manifest.json`
} as const;
