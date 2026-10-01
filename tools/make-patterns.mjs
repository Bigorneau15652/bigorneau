// Outil de developpement (non execute par le plugin) : transforme les fichiers de motifs de cesure TeX (projet hyph-utf8)
// en modules TypeScript, dans src/export/. Usage : node tools/make-patterns.mjs
import { readFileSync, writeFileSync } from "node:fs";

const LANGUAGES = [
  { file: `tools/hyph-fr.tex`, out: `src/export/patterns-fr.ts`, name: `FR`, label: `francais`, licence: `MIT (Flipo, Gaulle, Reutenauer)` },
  { file: `tools/hyph-en-gb.tex`, out: `src/export/patterns-en-gb.ts`, name: `EN_GB`, label: `anglais britannique`, licence: `MIT` },
];

const words = (block) =>
  block
    .split(`\n`)
    .map((l) => l.replace(/%.*/, ``).trim())
    .filter((l) => l !== ``)
    .flatMap((l) => l.split(/\s+/));

for (const lang of LANGUAGES) {
  const src = readFileSync(lang.file, `utf8`);
  const patterns = words(/\\patterns\{(.*?)\n\}/s.exec(src)[1]);
  const ex = /\\hyphenation\{(.*?)\}/s.exec(src);
  const exceptions = ex ? words(ex[1]) : [];
  for (const w of [...patterns, ...exceptions]) {
    if (/[`$\\]/.test(w)) throw new Error(`caractere inattendu dans ${w}`);
  }
  const text = [
    `// Fichier genere par tools/make-patterns.mjs : ne pas modifier a la main.`,
    `// Motifs de cesure de Liang pour le ${lang.label}, projet hyph-utf8, licence ${lang.licence} (voir licences/).`,
    `export const PATTERNS_${lang.name} = \`${patterns.join(` `)}\`;`,
    `// Mots dont la cesure est donnee a la main (les tirets marquent les coupures permises).`,
    `export const EXCEPTIONS_${lang.name} = \`${exceptions.join(` `)}\`;`,
    ``,
  ].join(`\n`);
  writeFileSync(lang.out, text);
  console.log(lang.out, patterns.length, `motifs`, exceptions.length, `exceptions`);
}
