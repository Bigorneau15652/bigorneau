import { test } from "node:test";
import assert from "node:assert/strict";
import { BOLD_OFF, BOLD_ON, emphasize, ITALIC_OFF, ITALIC_ON, STRIKE_OFF, STRIKE_ON } from "../src/export/inline";
import { findMath } from "../src/export/math";
import { abbreviationSpacing } from "../src/export/typography";
import { NO_BREAK_SPACE } from "../src/export/font-metrics";
import { PAGE_ZONE_RE } from "../src/page-zone";
import { PARAGRAPH_MARKER_RE } from "../src/paragraph-format";
import { LIST_MARKER_RE } from "../src/illustration-list";

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
  [new RegExp(String.raw`~~(?=\S)(.+?)(?<=\S)~~`, `g`), `${STRIKE_ON}$1${STRIKE_OFF}`],
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

// Les trois reperes %% page: %%, %% p: %% et %% liste: %% : l'expression d'origine (capture paresseuse entre deux series d'espaces) etait de
// temps cubique sur une ligne d'espaces. Le nouveau code doit donner le meme resultat, vite.
const OLD_MARKERS: [RegExp, RegExp, number][] = [
  [PAGE_ZONE_RE, new RegExp(String.raw`^[ \t]*%%[ \t]*page[ \t]*:[ \t]*([^%\n]*?)[ \t]*%%[ \t]*$`), 1],
  [PARAGRAPH_MARKER_RE, new RegExp(String.raw`^([ \t]*)%%[ \t]*p[ \t]*:[ \t]*([^%\n]*?)[ \t]*%%[ \t]?`), 2],
  [LIST_MARKER_RE, new RegExp(String.raw`^[ \t]*%%[ \t]*(?:liste|list)[ \t]*:[ \t]*([^%\n]*?)[ \t]*%%[ \t]*$`), 1],
];

test(`les reperes %% donnent le meme resultat qu'avant sur des lignes tirees au hasard`, () => {
  const r = rng(42);
  const alphabet = [`%`, `%%`, ` `, `\t`, `p`, `:`, `a`, `x`, `page`, `list`, `liste`, `=`, `1`, `,`];
  for (let n = 0; n < 60000; n++) {
    const line = randomText(r, alphabet, 14);
    for (const [fresh, old, group] of OLD_MARKERS) {
      const a = fresh.exec(line);
      const b = old.exec(line);
      assert.equal(a === null, b === null, JSON.stringify(line));
      if (a && b) {
        assert.equal(a[0], b[0], JSON.stringify(line));
        assert.equal(a[group].trim(), b[group], JSON.stringify(line));
      }
    }
  }
});

test(`une ligne de milliers d'espaces ne fige pas les reperes %%`, () => {
  const start = Date.now();
  const spaces = ` `.repeat(30000);
  for (const line of [`%% page:${spaces}`, `%% p:${spaces}x`, `%% liste:${spaces}`, `%%${spaces}page:${spaces}`, `${spaces}%% p:${spaces}`]) {
    PAGE_ZONE_RE.exec(line);
    PARAGRAPH_MARKER_RE.exec(line);
    LIST_MARKER_RE.exec(line);
  }
  assert.ok(Date.now() - start < 1500, `duree ${Date.now() - start} ms`);
});
