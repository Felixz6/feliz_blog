const themeRoot = "/themes/fuyukawa-kagari";

export function kagariAsset(path: string) {
  return `${themeRoot}/assets/${path.replace(/^\/+/, "")}`;
}

export const kagariAssets = {
  favicon: kagariAsset("kanade2.jpg"),
  appleTouchIcon: kagariAsset("avatar-sigil.png"),
  profile: kagariAsset("profile.png"),
  heroWallpaper: kagariAsset("hero-wallpaper.webp"),
  pageBackground: kagariAsset("fuyukawa-kagari-bg.webp"),
  notFound: kagariAsset("legacy/404.webp"),
  musicManifest: `${themeRoot}/music/manifest.json`
} as const;
