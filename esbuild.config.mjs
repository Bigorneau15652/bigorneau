import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const production = process.argv[2] === "production";

// Licence notice written at the top of main.js. The plugin is installed as three files only (main.js, manifest.json, styles.css), so
// the notices of the bundled works must travel inside main.js. The full texts are in the licences folder and in NOTICE.
const LICENSE_BANNER = `/*!
Bigorneau, a plugin for Obsidian. Copyright (c) 2026 Olivier Holweck. MIT License (see LICENSE in the repository).
This file bundles the following works:
- MathJax 3.2.2, Copyright (c) The MathJax Consortium, Apache License 2.0, https://github.com/mathjax/MathJax-src
  (the MathJax TeX math fonts it contains are under the SIL Open Font License 1.1).
- mhchemparser 4.2.1, Copyright (c) Martin Hensel, Apache License 2.0, https://github.com/mhchem/mhchemParser
- Libertinus Serif and Libertinus Mono 7.051 (Latin subset), Copyright 2012-2024 The Libertinus Project Authors,
  SIL Open Font License 1.1, https://github.com/alerque/libertinus
- Hyphenation patterns for French and British English from the hyph-utf8 project, MIT License,
  https://github.com/hyphenation/tex-hyphen
Full license texts: folder "licences" and file NOTICE of https://github.com/Bigorneau15652/bigorneau
*/`;

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  banner: { js: LICENSE_BANNER },
  sourcemap: production ? false : "inline",
  minify: production,
  treeShaking: true,
  outfile: "main.js",
});

if (production) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
