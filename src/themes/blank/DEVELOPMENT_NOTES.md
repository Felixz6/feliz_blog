# Blank Development Notes

## Note Responsibility

- Canonical implementation record for `src/themes/blank/`.
- The root `DEVELOPMENT_NOTES.md` owns shared architecture, routes, and other themes. Its existing uncommitted changes are not part of this task.

## Constraints

- Redesign the complete Blank theme as an achromatic, typography-led personal journal.
- Do not add images, fonts, dependencies, or remote runtime requests.
- Existing shared article attachments remain intact; Blank presents them in grayscale.
- Main agent only. No browser or subagent use without explicit permission.
- Do not change shared content, routes, registry, metadata, other themes, or original media.
- Cross-theme switches retain the shared full-document navigation and query/hash preservation.

## Current State

- Repository: `C:\Users\a1234\Desktop\个人博客`; PowerShell 7.6.5; branch `main`.
- Pre-redesign recovery point: `1c82e2ece0205810a66b680a1d40922e8e29be1c`. Blank is clean at this checkpoint.
- Existing root note and untracked source materials are unrelated and must remain untouched.
- Implemented: seven page types, shared monochrome layout, keyboard-accessible theme menu, local archive search/filter, project disclosures, article navigation.
- Final verification: 18 Blank tests plus 38 Fuyukawa regression tests pass (56 total). All 181 repository tests pass. Astro build produces 74 routes / 75 Pagefind pages; all 17 existing budgets pass unchanged.
- Existing server: `http://127.0.0.1:4321/themes/blank/`, PID 23024. Not started, stopped, or restarted by this task.
- HTTP: ordinary themed routes return 200; `/themes/blank/404/` returns the expected 404 with the Blank body (not an error overlay).
- Production audit: 18 Blank pages / 12 articles / 276 themed links / 202 existing-library icons; no missing resources, invalid targets, duplicate IDs, or foreign theme CSS. Non-article pages contain zero images. The 37 article image instances come exclusively from existing shared content.
- Home output: HTML 30,720 bytes; linked CSS 32,780 bytes; directly linked JavaScript 6,937 bytes. This excludes inline shared scripts and is not a total-transfer or real-device performance claim.
- Fuyukawa's 18-page generated-output audit also passes. Its sources and assets are unchanged.
- Test/build processes have exited. Final logs are under `%TEMP%`: `blank-redesign-theme-final.log`, `blank-redesign-repository-final.log`, and `blank-redesign-build-final.log`.
- Git whitespace checks pass. The unrelated root note remains exactly 457 added lines; none is staged for this task.
- Implementation is complete and automatically tested, pending human visual acceptance.
- Local implementation checkpoint: `4fbca7440df0b311457c0ef2735cf14edfc45d22` (`feat(blank): rebuild theme as a monochrome editorial journal`), containing only 16 Blank files. No push.
- Human visual acceptance remains separate; no browser verification is authorized.

## Design Decisions

- White paper, black ink, neutral gray only; no gradients, shadows, decorative images, rounded cards, or viewport-scaled type.
- Editorial hierarchy through fixed type scales, numbered sections, rules, generous whitespace, and a black Home feature band.
- Preserve complete content, native document scrolling, static-page readability, accessible focus states, and reduced-motion behavior.
- Keep enhancement controls hidden until their runtime is mounted; failed/disabled JavaScript must leave links and content usable.
- Search matches titles, summaries, tags, and categories locally, with URL query/category/sort persistence. This is not full-text search of article bodies.
- Shared Expressive Code defaults use transparent idle button backgrounds. Blank must use a white copy icon on its black code background; the initial black icon override was corrected before delivery.
- Two shared articles already contain a Markdown H1 repeating their frontmatter title. Do not delete or rewrite that content as part of this theme task. The build audit checks exactly one page H1 outside prose and verifies any prose H1 against the original Markdown.

## Files and Behavior

- `layouts/BlankLayout.astro`: centered numbered navigation, current-route state, monochrome footer, theme chooser, SEO/preference integration. No ClientRouter.
- `styles/theme.css`: complete replacement of the former red accent and lined-paper styling; independent mobile/short-screen/print/reduced-motion rules.
- `components/PageHead.astro`, `components/PostRow.astro`: shared title and article-index typography.
- `lib/collection.mjs`: local matching, IME handling, search/category/sort URL state, count/empty/clear behavior, history and cleanup.
- `lib/runtime.mjs`: viewport-clamped theme menu with focus recovery and keyboard navigation; event-driven article progress/TOC with visibility/resize/disclosure handling; safe 404 text; bfcache-aware lifetime.
- `tests/redesign.test.mjs`: source contracts and execution of production logic with DOM fixtures, not browser rendering.
- `tools/audit-build.mjs`: generated HTML/links/IDs/assets/style isolation and lightweight Home budget checks.

## Next Gate

1. Human acceptance of composition, reading comfort, and mobile layout.
2. Any refinement remains confined to Blank; keep the established pre-redesign checkpoint and this implementation checkpoint available.
