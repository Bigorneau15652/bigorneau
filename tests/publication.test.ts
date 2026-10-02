import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Garde-fous de la publication dans le repertoire des plugins communautaires d'Obsidian : regles des politiques des developpeurs,
// des exigences de soumission et des consignes de revue (pages Developer policies, Submission requirements for plugins et
// Plugin guidelines). Ils se lancent depuis la racine du projet.

const ROOT = process.cwd();
const read = (f: string): string => readFileSync(join(ROOT, f), `utf8`);
const manifest = JSON.parse(read(`manifest.json`)) as Record<string, unknown>;

// Fichiers du code, sauf les tables de donnees generees (polices en base64, motifs de cesure).
function sources(dir = `src`): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) out.push(...sources(path));
    else if (e.name.endsWith(`.ts`) && !/^(fonts-libertinus|patterns-)/.test(e.name)) out.push(path);
  }
  return out;
}

test(`le manifest respecte les exigences de soumission`, () => {
  const id = String(manifest.id);
  assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.ok(!id.toLowerCase().includes(`obsidian`), `l'identifiant ne contient pas obsidian`);
  assert.ok(!String(manifest.name).toLowerCase().includes(`obsidian`), `le nom ne contient pas obsidian (politique de marque)`);
  assert.match(String(manifest.version), /^\d+\.\d+\.\d+$/);
  assert.match(String(manifest.minAppVersion), /^\d+\.\d+\.\d+$/);
  assert.equal(typeof manifest.isDesktopOnly, `boolean`);
  assert.ok(String(manifest.author).trim() !== ``);
  const description = String(manifest.description);
  assert.ok(description.length <= 250, `description : ${description.length} caracteres`);
  assert.ok(description.endsWith(`.`), `la description se termine par un point`);
  assert.ok(!/^this is\b/i.test(description), `la description ne commence pas par « This is »`);
  assert.ok(/^[\x20-\x7e]+$/.test(description), `la description n'a ni emoji ni caractere special`);
  assert.ok(!(`fundingUrl` in manifest), `pas de fundingUrl sans soutien financier`);
});

test(`les versions du manifest, du paquet et de versions.json sont les memes`, () => {
  const pkg = JSON.parse(read(`package.json`)) as { name: string; version: string };
  const versions = JSON.parse(read(`versions.json`)) as Record<string, string>;
  const lock = JSON.parse(read(`package-lock.json`)) as { version: string; packages: Record<string, { version?: string }> };
  assert.equal(pkg.version, manifest.version);
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[``].version, manifest.version);
  assert.equal(versions[String(manifest.version)], manifest.minAppVersion);
  assert.equal(pkg.name, manifest.id);
});

test(`le depot contient la licence et les deux README`, () => {
  assert.ok(existsSync(join(ROOT, `LICENSE`)));
  const licence = read(`LICENSE`);
  assert.ok(licence.startsWith(`MIT License`));
  assert.ok(licence.includes(String(manifest.author)), `la licence nomme l'auteur du manifest`);
  for (const f of [`README.md`, `README.fr.md`]) {
    const text = read(f);
    assert.ok(text.length > 3000, f);
    // Les politiques demandent d'indiquer l'usage du reseau et les credits des licences dans le README.
    assert.match(text, /MathJax/);
    assert.match(text, /Libertinus/);
    assert.match(text, /LICENSE/);
    assert.match(text, f === `README.md` ? /does not connect to the internet/ : /ne se connecte pas à Internet/);
  }
});

test(`le code evite les constructions refusees ou deconseillees par la revue`, () => {
  for (const f of sources()) {
    const code = read(f);
    // Expressions a « lookbehind » : le plugin entier ne se charge pas sur les iPhone et iPad anterieurs a iOS 16.4.
    assert.ok(!/\(\?<[=!]/.test(code), `${f} : expression a lookbehind`);
    assert.ok(!/\.(innerHTML|outerHTML)\b|insertAdjacentHTML\(/.test(code), `${f} : construction de HTML par texte`);
    assert.ok(!/window\.app\b/.test(code), `${f} : instance globale d'Obsidian`);
    assert.ok(!/console\.(log|debug)\(/.test(code), `${f} : journal dans la console`);
    assert.ok(!/from [`"'](fs|path|os|crypto|child_process|electron)[`"']/.test(code), `${f} : interface Node.js ou Electron`);
    assert.ok(!/\beval\(/.test(code), `${f} : execution de code`);
    // L'execution d'un script ajoute a la main est isolee dans un seul fichier, pour que la revue la trouve du premier coup.
    if (f !== `src/script-runner.ts`) assert.ok(!/new Function\(/.test(code), `${f} : execution de code`);
    assert.ok(!/\bfetch\(|XMLHttpRequest|requestUrl\(|WebSocket/.test(code), `${f} : acces au reseau`);
  }
});

test(`les commandes n'ont ni raccourci par defaut ni l'identifiant du plugin dans le leur`, () => {
  const main = read(`src/main.ts`);
  assert.ok(!/hotkeys\s*:/.test(main));
  const ids = [...main.matchAll(/\bid: `([a-z-]+)`/g)].map((m) => m[1]);
  assert.ok(ids.length >= 15, `commandes trouvees : ${ids.length}`);
  for (const id of ids) assert.ok(!id.includes(String(manifest.id)), id);
});
