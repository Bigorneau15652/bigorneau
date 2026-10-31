# Working notes for Claude Code sessions

Bigorneau is an Obsidian plugin (TypeScript, one bundled `main.js`, desktop only). This file holds the rules to follow when working on the repository. The maintainer is not a programmer.

## Dialogue

- Talk to the maintainer in French, in plain words, without flattery. Explain every step that the maintainer has to do (merging a pull request, publishing a release, updating the plugin), with the exact names of the buttons.
- Before programming, ask the questions that remove ambiguity, in small groups, with a recommendation. Work by small versions that the maintainer can test one by one.
- Texts meant to be pasted into Word contain no emoji, no horizontal rules and no needless bullets. In French, never put a comma before "et" and avoid long dashes in the middle of a sentence.

## Code rules

- All strings are written as template literals (backticks), never with single or double quotes, so that French apostrophes cause no syntax error.
- Code identifiers are in English. Comments are written in English: one short block above every function, method, class and file, in the present tense. Messages shown to the user are not comments: they go through `t()` in `src/i18n.ts` with their English text in `src/i18n-en.ts` (French text is the key; a French text must not be translated twice).
- Never turn text into code (`new Function`, `eval`): a test forbids it. No network access in the plugin (no `fetch`, `XMLHttpRequest`, `requestUrl`, `WebSocket`): a test forbids it. The plugin loads no code other than its own `main.js`.
- Colours and values read from notes, settings or profiles are validated before use (see `src/style.ts`, `src/settings.ts`, `src/text-style.ts`).
- Do not rename CSS classes `mmw-`, view types, command identifiers or setting keys: shortcuts and saved layouts depend on them.
- Do not touch the parser `src/model.ts`, the checks after writing in `src/edit.ts` or the sequential edit queue without a very good reason: they were tested with tens of thousands of random operations.
- When the interface shows an element that hides its source text (for example a picture whose link text is hidden by Obsidian), a click on it must let the maintainer edit that text.
- Never give a maximum height to a preview, a frame or a line that can cut a border or a rule.
- Before building a feature that depends on a host or an external service, write a small test file and ask the maintainer to try it on that host first.
- No new dependency, font or data file without the agreement of the maintainer. Each one is recorded with its licence in `docs/DEPENDANCES.md` and `NOTICE`.

## Architecture of the export

The PDF export is a layout engine written for the plugin, in independent stages that can be tested without Obsidian (`node --test`): document tree (`src/export/doc-tree.ts`), style (`src/text-style.ts`, `src/page-config.ts`), measuring and typesetting (`src/export/typeset.ts`, `font.ts`, `paragraph.ts`), line breaking with the Knuth and Plass algorithm (`line-break.ts`), page assembly (`paginate.ts`), then two outputs that consume the same pages: the preview (`src/export-view.ts`) and the PDF writer (`src/export/pdf.ts`). The preview and the PDF must stay identical. The algorithms are reimplemented from their published descriptions, without reuse of code under another licence (never copy GPL code).

## Tests and checks

- `npm test` builds and runs all test files listed in `package.json`; add every new test file to that list. `npm run build` type-checks (unused variables and parameters are errors) and writes `main.js`. No test is disabled or weakened to get a green result.
- A test checks that `manifest.json`, `package.json`, `package-lock.json` (two places) and `versions.json` carry the same version.

## Versions, commits and releases

- One small version at a time. Commit message: `Version 0.21.0 : short description in French`.
- Every version has a section `## X.Y.Z` in `CHANGELOG.md`, in English then in French (a test checks it). The release workflow copies it onto the GitHub release page.
- To change the version, edit `manifest.json`, `package.json`, `package-lock.json` (the `version` at the top and the one under `packages[""]`) and add a line to `versions.json` with the minimum Obsidian version.
- A release is a GitHub release whose tag is the version number without `v`, with `main.js`, `manifest.json` and `styles.css` attached. The maintainer publishes it from GitHub after merging the pull request.
- Work on the branch given by the session, push, and open a draft pull request.

## Decisions of the maintainer

- HTML export: one self-contained HTML file first (version 0.29.0), then a mode with separate folders for the media. The page is a reader: menus of the headings and of the thumbnails on the left (each opens on its own, or both), light and dark mode, full screen (Escape brings the buttons back) and wide mode on the right. A Nextcloud public link shows an HTML file as text, so the file is meant for a web host (for example GitHub Pages), a download or a local opening.
- In the HTML export a video is a player embedded from an online link (YouTube, Vimeo), never a video file loaded into the document. The thumbnails are those of the figures and pictures, not of pages. A picture twice as wide as high is read as a 360 degree panorama with Pannellum (MIT licence, agreed by the maintainer).

- The plugin is for the desktop version of Obsidian only (`isDesktopOnly: true`). The public author name in `manifest.json` is `Bigorneau`; the copyright holder in `LICENSE` is the real author.
- Modules (Formulas, Page layout) are built into the plugin. Loading scripts from files is not supported.
- The metadata of the PDF holds only the title, the author typed by the user, the dates and the name of the plugin: nothing about the machine or the user's account.
