import { test } from "node:test";
import assert from "node:assert/strict";
import { BOLD_OFF, BOLD_ON, emphasize, ITALIC_OFF, ITALIC_ON } from "../src/export/inline";
import { findMath } from "../src/export/math";
import { abbreviationSpacing } from "../src/export/typography";
import { NO_BREAK_SPACE } from "../src/export/font-metrics";

// Les expressions a « lookbehind » ont ete remplacees (les anciens iPhone et iPad ne savent pas les lire). Ces tests comparent le
// nouveau code aux expressions d'origine, ecrites ici sous forme de texte pour que le source du plugin n'en contienne plus, sur
// des milliers de textes tires au hasard (generateur deterministe).

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randomText(r: () => number, alphabet: string[], maxLength: number): string {
  const n = Math.floor(r() * (maxLength + 1));
  let out = ``;
  for (let i = 0; i < n; i++) out += alphabet[Math.floor(r() * alphabet.length)];
  return out;
}

const OLD_EMPHASIS: [RegExp, string][] = [
  [new RegExp(String.raw`\*\*\*(?=\S)([^*]+?)(?<=\S)\*\*\*`, `g`), `${BOLD_ON}${ITALIC_ON}$1${ITALIC_OFF}${BOLD_OFF}`],
  [new RegExp(String.raw`\*\*(?=\S)(.+?)(?<=\S)\*\*`, `g`), `${BOLD_ON}$1${BOLD_OFF}`],
  [new RegExp(String.raw`(?<![\p{L}\d])__(?=\S)(.+?)(?<=\S)__(?![\p{L}\d])`, `gu`), `${BOLD_ON}$1${BOLD_OFF}`],
  [new RegExp(String.raw`\*(?=[^\s*])([^*]+?)(?<=[^\s*])\*`, `g`), `${ITALIC_ON}$1${ITALIC_OFF}`],
  [new RegExp(String.raw`(?<![\p{L}\d_])_(?=[^\s_])([^_]+?)(?<=[^\s_])_(?![\p{L}\d_])`, `gu`), `${ITALIC_ON}$1${ITALIC_OFF}`],
  [new RegExp(String.raw`~~(?=\S)(.+?)(?<=\S)~~`, `g`), `$1`],
  [new RegExp(String.raw`==(?=\S)(.+?)(?<=\S)==`, `g`), `$1`],
];

const oldEmphasis = (s: string): string => OLD_EMPHASIS.reduce((acc, [re, to]) => acc.replace(re, to), s);

test(`l'emphase (gras, italique, barre, surlignage) donne le meme resultat que les expressions d'origine`, () => {
  const r = rng(1);
  const alphabet = [`*`, `*`, `_`, `_`, ` `, ` `, `a`, `b`, `é`, `1`, `~`, `=`, `.`, `\n`, `-`];
  let changed = 0;
  for (let i = 0; i < 30000; i++) {
    const t = randomText(r, alphabet, 16);
    const expected = oldEmphasis(t);
    assert.equal(emphasize(t), expected, JSON.stringify(t));
    if (expected !== t) changed++;
  }
  // Le tirage contient beaucoup de textes qui declenchent bien une regle.
  assert.ok(changed > 3000, `textes modifies : ${changed}`);
  for (const t of [`**gras** et *italique* et ***les deux***`, `un __gras__ mot_a_mot _italique_ et snake_case_name`, `~~barre~~ ==surligne== **a** b c**`, `a **b ** c`, `**  **`]) assert.equal(emphasize(t), oldEmphasis(t), t);
});

const OLD_ABBR = new RegExp(String.raw`(?<![\p{L}\d])(M\.|MM\.|Mme|Mmes|Mlle|Dr|Pr|p\.|pp\.|art\.|fig\.|chap\.|vol\.|n°|N°)[ ]+(?=[\p{L}\d])`, `gu`);

test(`les abreviations suivies d'une espace insecable donnent le meme resultat que l'expression d'origine`, () => {
  const r = rng(2);
  const tokens = [`M.`, `MM.`, `Mme`, `Mmes`, `Dr`, `p.`, `pp.`, `n°`, `AM.`, `Pr`, ` `, ` `, `  `, `a`, `1`, `é`, `.`, `chap.`, `Xp.`];
  let changed = 0;
  for (let i = 0; i < 30000; i++) {
    let t = ``;
    for (let k = Math.floor(r() * 9); k > 0; k--) t += tokens[Math.floor(r() * tokens.length)];
    const expected = t.replace(OLD_ABBR, `$1${NO_BREAK_SPACE}`);
    assert.equal(abbreviationSpacing(t), expected, JSON.stringify(t));
    if (expected !== t) changed++;
  }
  assert.ok(changed > 3000, `textes modifies : ${changed}`);
  assert.equal(abbreviationSpacing(`M. M. Dupont, AM. Durand et Mme Martin`), `M.${NO_BREAK_SPACE}M.${NO_BREAK_SPACE}Dupont, AM. Durand et Mme${NO_BREAK_SPACE}Martin`);
});

const OLD_MATH = new RegExp(String.raw`\$\$([^$]+?)\$\$|(?<![\\$])\$(?![\s$])([^$\n]+?)(?<![\s\\])\$(?!\d)`, `g`);

test(`les formules repérées sont les memes que celles de l'expression d'origine, aux memes positions`, () => {
  const r = rng(3);
  const alphabet = [`$`, `$`, `$`, `\\`, ` `, ` `, `a`, `b`, `1`, `\n`, `x`, `^`];
  let found = 0;
  for (let i = 0; i < 40000; i++) {
    const t = randomText(r, alphabet, 14);
    const expected = [...t.matchAll(OLD_MATH)].map((m) => ({ start: m.index as number, end: (m.index as number) + m[0].length, display: m[1] !== undefined, tex: m[1] ?? m[2] }));
    assert.deepEqual(findMath(t), expected, JSON.stringify(t));
    found += expected.length;
  }
  assert.ok(found > 5000, `formules trouvees : ${found}`);
  assert.deepEqual(findMath(`\\$a$b$ et $c$`).map((m) => m.tex), [`b`, `c`]);
});

test(`le decoupage en lignes qui garde les fins de ligne est identique a l'ancien`, () => {
  const old = (s: string): string[] => s.split(new RegExp(String.raw`(?<=\n)`));
  const r = rng(4);
  for (let i = 0; i < 5000; i++) {
    const t = randomText(r, [`a`, `b`, `\n`, `\r`, `-`], 12);
    if (t === ``) continue;
    assert.deepEqual(t.match(/[^\n]*\n|[^\n]+/g) ?? [], old(t), JSON.stringify(t));
  }
});
