import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EN } from "../src/i18n-en";
import { setLanguage, t } from "../src/i18n";

// Les tests se lancent depuis la racine du projet.
const SRC = join(process.cwd(), `src`);

// Textes francais passes a t() (ou noms d'icones, lus par t(def.name)) dans le code.
function keys(): string[] {
  const out = new Set<string>();
  for (const f of readdirSync(SRC)) {
    if (!f.endsWith(`.ts`) || f === `i18n.ts` || f === `i18n-en.ts`) continue;
    const text = readFileSync(join(SRC, f), `utf8`);
    for (const m of text.matchAll(/\bt\(`((?:[^`\\$]|\\.)*)`/g)) out.add(m[1]);
    if (f === `icons.ts`) for (const m of text.matchAll(/name: `([^`]*)`/g)) out.add(m[1]);
  }
  return [...out];
}

const holes = (s: string): string[] => [...new Set(s.match(/\{\d+\}/g) ?? [])].sort();

test(`chaque texte traduisible a une traduction anglaise`, () => {
  const missing = keys().filter((k) => EN[k] === undefined);
  assert.deepEqual(missing, []);
});

test(`les valeurs variables sont les memes en francais et en anglais`, () => {
  for (const k of keys()) assert.deepEqual(holes(EN[k] ?? k), holes(k), k);
});

test(`aucune traduction ne reste sans usage`, () => {
  const used = new Set(keys());
  assert.deepEqual(Object.keys(EN).filter((k) => !used.has(k)), []);
});

test(`t() renvoie le francais ou l'anglais selon la langue`, () => {
  setLanguage(`fr`);
  assert.equal(t(`Note : {0}`, `A`), `Note : A`);
  setLanguage(`en`);
  assert.equal(t(`Note : {0}`, `A`), `Note: A`);
  assert.equal(t(`texte inconnu {0}`, 1), `texte inconnu 1`);
  setLanguage(`fr`);
});
