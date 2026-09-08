# Fuyukawa Presentation Refresh

## Scope

Theme-local supplement to the repository's `DEVELOPMENT_NOTES.md`. This file owns
only the September 2026 Fuyukawa presentation refresh; shared architecture and
Kisara history remain authoritative in the repository note, which is not edited.

## Current State

- Requested: refresh every Fuyukawa page and section with a fresh anime aesthetic.
- Main agent only. Edit only `src/themes/fuyukawa-kagari/` and its dedicated
  `public/themes/fuyukawa-kagari/` assets.
- The user explicitly prohibits browser and subagent use in this task without
  permission. Source, fixture tests, build and HTTP checks are not visual acceptance.
- Original refresh baseline: `main`, `4fba1e1663f24a1f0e4f71e03c1575fbf0c36abc`.
  The layered manga iteration starts from `671b016`; see the final section.
- Original theme copied to
  `C:\Users\a1234\Desktop\codex-backups\fuyukawa-refresh-20260909-001424\fuyukawa-kagari`.
- Existing root note edits and untracked media are unrelated and must stay intact.
- Existing preview: `http://127.0.0.1:4321/themes/fuyukawa-kagari/`.
- Presentation uses a theme body attribute and a final stylesheet so legacy
  interaction styles remain available. No shared configuration or assets changed.
- Preserve the homepage reveal state machine, tag canvas, music and Live2D.
- Blog search now rejects stale async results and reinitializes after navigation;
  project filters reinitialize after navigation and expose pressed states.
- Revised implementation and non-browser verification are complete; visual
  acceptance remains pending. Local checkpoint subject:
  `style(fuyukawa): renew anime diary pages and utilities`. Nothing is pushed.

## September 9 Review

- The first green/minimal candidate was rejected by the user. It loaded correctly
  in their screenshot but looked too generic, with a heavy green title and a
  partially exposed tool drawer. Do not call this an accepted visual direction.
- The revision uses a handwritten white/sky title with pink offset detail,
  translucent navigation, pastel paper edges on individual entries, and a fully
  concealed drawer with a visible icon handle. Original media remains untouched.
- Pre-revision snapshot:
  `C:\Users\a1234\Desktop\codex-backups\fuyukawa-refresh-20260909-001424\before-anime-rework`.
- Vite on port 4321 cached the initial missing relative stylesheet import.
  Switching to the existing project alias restored both page and CSS HTTP 200;
  the file was present, and no user server was stopped.
- First-pass tests: 9 theme fixtures, 181 repository tests, 74 built routes and 75
  indexed pages passed. CSS exceeded the existing 112000-byte budget; superseded
  declarations and unused legacy sections were subsequently consolidated with
  PostCSS and selector parsing.

## Final Verification

- Theme fixtures: `node --test src/themes/fuyukawa-kagari/tests/refresh.test.mjs`,
  10/10, including drawer concealment, search races and route reinitialization.
- Repository tests: `npm test`, 181/181.
- Production: direct Astro build, 74 routes, 75 Pagefind pages. Asset generation
  was deliberately not run because no original image/music regeneration is needed.
- All 17 existing performance budgets pass without changes: Fuyukawa Home HTML
  96.5 KiB / 97.7 KiB; CSS 105.7 KiB / 109.4 KiB.
- Parse5 audit: 18 Fuyukawa documents, 125 image references, 78 inline scripts and
  150 Fuyukawa links checked, no missing local resources or script syntax errors.
- Original 4321 preview returns HTTP 200 for Home, Blog, Game, Works, About and a
  sample article. The themed 404 correctly responds with status 404.
- `public/`, shared data/configuration/routes, Kisara and Blank have no task diff.
  The root development note's pre-existing changes are untouched.
- Test/build logs: `%TEMP%/fuyukawa-refresh-{focused-final,tests-final,build-final}.log`.
  Test and build processes exited normally. No browser or subagent was used.
- Visual acceptance is still pending. Subsequent cover/header feedback and its
  corrections are recorded below; earlier automated passes do not imply approval.

## Cover and Header Correction

- User feedback on `97a78da6561078d5a96e6a2f3ca7880c0122872e`: Home and Blog covers
  cut off the subjects, and the user prefers a transparent centered header.
  This supersedes the earlier landscape-frame and opaque header decisions.
- Root cause: portrait sources were fitted with `cover` into forced 8:5 boxes.
  The screenshot's sources are 1003x1416, 1319x2000 and 1400x2207, respectively.
- Both listings now use stable 7:10 frames with centered `contain`, including
  square/landscape fallbacks. Images are not edited; old Blog crop offsets removed.
- Header band is transparent; equal side grid tracks place the glass navigation
  at viewport center independently of the brand. Narrow screens center only the
  navigation and omit the brand to avoid overlap.
- Recovery point: `97a78da`. Scope limited to Fuyukawa cover/header presentation,
  targeted tests and this note. No browser or subagent use.
- Verification: 12/12 theme tests, 181/181 repository tests, 74 built pages and
  75 Pagefind pages. All 17 budgets pass; Fuyukawa Home CSS is 106.0/109.4 KiB.
  Test/build processes exited normally. Logs use `%TEMP%/fuyukawa-cover-header-*`.
- Existing 4321 Home, Blog and stylesheet return HTTP 200; the served CSS contains
  the 7:10 frames, contain fitting and symmetric navigation tracks. No server was
  restarted and no image, shared route, other theme or root note was changed.
- Implemented and automatically verified; actual visual acceptance remains with
  the user. Scoped local checkpoint subject:
  `fix(fuyukawa): preserve cover artwork and center transparent navigation`.

## Layered Manga Art Direction

- New request: separate the Home character and manga backdrop without harming
  either, add parallax, and design all theme pages around the supplied artwork.
- Recovery checkpoint: `671b0161a53f468550e873ed5de81b8fe375cdd0`, theme clean.
- The user authorizes deriving crops, cutouts and redraws from all 55 still images
  under root `fuyukawa/`; the two MP4s are excluded. Sources remain read-only.
- Keep the recently corrected complete article covers and centered transparent
  navigation. Preserve original assets under their existing filenames.
- Only the main agent, no browser/subagents. Use local compressed contact sheets,
  deterministic media checks, runtime fixtures, compilation and HTTP verification;
  none of these is human visual acceptance.
- Original source images total 12.33 MiB. Inspection copies go to
  `%TEMP%/fuyukawa-art-review`; generated production artwork stays theme-local.
- Media implemented: 19 derivatives (about 2.94 MiB), including five transparent
  stickers, a lossless 1920x1080 character cutout and a rebuilt manga background.
  `tools/prepare-art.mjs` records source/output hashes and exact crop provenance.
- The flattened poster has no recoverable hidden background. A first edge-fill
  attempt visibly smeared manga lines and was rejected internally. The current
  background keeps five intact original panel regions pixel-identical and composes
  clean supplied panels in the center. No claim of recovering the original layers.
  The original poster is unchanged and remains the failed-load fallback.
- Runtime: small bounded pointer spring + scroll depth; transform on each image,
  no global input capture, atomic decode, idle/offscreen/hidden/lite/reduced-motion
  handling and Astro navigation cleanup. The existing profile reveal state machine
  is mechanically extracted into `lib/home-hero.mjs`, not redesigned.
- Page direction implemented: horizontal chapter leaves, category-spine archive,
  numbered workshop sheets, illustrated playroom, personal colour-plate album,
  and article colophon/margin art. Complete article covers and centered nav remain.
- Intermediate snapshot before CSS loading split:
  `C:\Users\a1234\Desktop\codex-backups\fuyukawa-manga-before-style-split-20260909`.
- First media/runtime fixtures: 13/13 pass, previous refresh fixtures: 12/12 pass.
  Pixel test caught a 9px panel overlap; reconstruction tile moved, and intact
  panel byte comparisons now pass. Build caught unavailable icons; reused allowed
  existing icons without changing shared config. Final results are recorded below.
- Inner-page-only rules move to `refresh-pages.css` / `manga-pages.css`. Ordinary
  per-page imports still bundled them into Home through the theme barrel exports.
  BaseLayout now conditionally links their Vite `?url` assets on non-Home routes;
  no shared route, barrel or budget changes are needed.

### Final State And Verification

- Implemented and automatically verified; not browser-verified or human-accepted.
  The user still needs to judge the art direction, hair/earmuff cutout edges,
  parallax feel and actual mobile typography. Do not label this visually approved.
- Home's foreground uses contain fitting with a 16px lower movement allowance,
  while the independently rebuilt background fills the scene. Original opaque
  character pixels and five preserved background rectangles compare exactly.
  This is deterministic masking/compositing, not generative restoration.
- The old duplicate Blog list was removed so category filtering has one source
  of truth. Search intentionally continues searching the whole archive.
- Existing profile reveal states are preserved by a VM interaction test.
  Hero cleanup now cancels initial-scroll and avatar timers. Before-swap cleanup
  also stops the old tag-rain/notice runtime and releases the notice body lock.
- Theme tests: 26/26. Repository tests: 181/181. Production: 74 routes and
  75 Pagefind pages. All 17 unchanged performance budgets pass.
  Home HTML 93.5/97.7 KiB; Home CSS 92.7/109.4 KiB (previously 106.0 KiB).
- `tools/audit-build.mjs`: 18 theme documents, 172 image references, 77 inline
  scripts, 154 local links and 57 stylesheet references pass. No duplicate IDs,
  unresolved controls, missing assets or inner-page styles on Home.
- Original 4321 preview responds HTTP 200 for Home/Blog/Works/Game/About and both
  split hero images. No preview server was started or stopped. Build/test
  processes exited normally. Logs: `%TEMP%/fuyukawa-manga-*-final.log`.
- Only this theme's source and `public/themes/fuyukawa-kagari/assets/manga/`
  derivatives belong to the patch. The root note's pre-existing 457-line addition,
  other themes, shared routes/content, all original images and both MP4s are intact.
- Scoped local milestone subject:
  `feat(fuyukawa): build a layered manga notebook`. Nothing is pushed.
- Code checkpoint created: `787fa0c`, 49 theme-only files. The scoped staging
  audit and whitespace check pass; the original `671b016` recovery point and
  external intermediate snapshot remain available.
