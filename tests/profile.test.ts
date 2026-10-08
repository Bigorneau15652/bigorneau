import { test } from "node:test";
import assert from "node:assert/strict";
import { applyProfile, buildProfile, parseProfile, PROFILE_EXCLUDED, PROFILE_VERSION, profileName, sameProfile, serializeProfile } from "../src/profile";
import { DEFAULT_SETTINGS, migrateSettings } from "../src/settings";

const base = () => migrateSettings({ exportAuthor: `Ada`, fontFolder: `Mes/Polices`, profileFolder: `Mes/Profils`, scriptsEnabled: { formulas: true }, scriptsApproved: { x: `abc` } });

test(`un profil garde les reglages mais pas ce qui est propre a l'auteur, aux dossiers ni aux scripts`, () => {
  const s = base();
  s.exportBullets = [`arrow`, `dash`, `square`, `dot`, `none`, `disc`];
  s.exportFooter = `none`;
  const p = buildProfile(`Rapport`, s, new Date(`2026-10-08T10:00:00Z`));
  assert.equal(p.name, `Rapport`);
  assert.equal(p.version, PROFILE_VERSION);
  for (const key of PROFILE_EXCLUDED) assert.ok(!(key in p.settings), `${key} ne doit pas etre dans le profil`);
  assert.deepEqual(p.settings.exportBullets, [`arrow`, `dash`, `square`, `dot`, `none`, `disc`]);
  assert.equal(p.settings.exportFooter, `none`);
  assert.ok(p.settings.typography);
});

test(`charger un profil remplace les reglages mais garde l'auteur, les dossiers et les scripts`, () => {
  const saved = base();
  saved.exportBullets = [`diamond`, `diamond`, `diamond`, `diamond`, `diamond`, `diamond`];
  saved.exportToc = true;
  saved.maxWidth = 321;
  const profile = parseProfile(serializeProfile(buildProfile(`P`, saved)))!;
  const current = base();
  current.exportAuthor = `Grace`;
  current.fontFolder = `Autre/Polices`;
  current.exportBullets = [...DEFAULT_SETTINGS.exportBullets];
  const next = applyProfile(current, profile);
  assert.equal(next.maxWidth, 321);
  assert.equal(next.exportToc, true);
  assert.deepEqual(next.exportBullets, [`diamond`, `diamond`, `diamond`, `diamond`, `diamond`, `diamond`]);
  assert.equal(next.exportAuthor, `Grace`);
  assert.equal(next.fontFolder, `Autre/Polices`);
  assert.deepEqual(next.scriptsEnabled, { formulas: true });
  assert.deepEqual(next.scriptsApproved, { x: `abc` });
  // Les reglages d'origine ne sont pas modifies.
  assert.equal(current.maxWidth, DEFAULT_SETTINGS.maxWidth);
});

test(`un profil ne peut pas activer un script ni changer l'auteur, meme s'il les contient`, () => {
  const current = base();
  const profile = parseProfile(JSON.stringify({ kind: `bigorneau-profile`, version: 1, name: `X`, settingsVersion: current.settingsVersion, settings: { exportAuthor: `Intrus`, scriptsEnabled: { evil: true }, scriptsApproved: { evil: `1` }, fontFolder: `Ailleurs`, maxWidth: 250 } }))!;
  const next = applyProfile(current, profile);
  assert.equal(next.maxWidth, 250);
  assert.equal(next.exportAuthor, `Ada`);
  assert.deepEqual(next.scriptsEnabled, { formulas: true });
  assert.deepEqual(next.scriptsApproved, { x: `abc` });
  assert.equal(next.fontFolder, `Mes/Polices`);
});

test(`des valeurs invalides dans un profil sont corrigees comme au demarrage du plugin`, () => {
  const current = base();
  const profile = parseProfile(JSON.stringify({ kind: `bigorneau-profile`, version: 1, settingsVersion: current.settingsVersion, settings: { exportBullets: [`n-importe-quoi`], exportFloats: `ailleurs` } }))!;
  const next = applyProfile(current, profile);
  assert.deepEqual(next.exportBullets, DEFAULT_SETTINGS.exportBullets);
  assert.equal(next.exportFloats, `float`);
});

test(`un fichier qui n'est pas un profil, ou un profil d'une version plus recente, est refuse`, () => {
  assert.equal(parseProfile(`pas du json`), null);
  assert.equal(parseProfile(`[]`), null);
  assert.equal(parseProfile(JSON.stringify({ kind: `autre`, version: 1, settings: {} })), null);
  assert.equal(parseProfile(JSON.stringify({ kind: `bigorneau-profile`, version: 99, settings: {} })), null);
  assert.equal(parseProfile(JSON.stringify({ kind: `bigorneau-profile`, version: 1, settings: [] })), null);
});

test(`le nom d'un profil devient un nom de fichier valable`, () => {
  assert.equal(profileName(`  Rapport / stage : 2026  `), `Rapport stage 2026`);
  assert.equal(profileName(`...cache`), `cache`);
  assert.equal(profileName(`a<b>c|d?`), `a b c d`);
  assert.equal(profileName(`   `), ``);
  assert.equal(profileName(`x`.repeat(200)).length, 80);
  assert.ok(sameProfile(`Rapport`, `rapport`));
  assert.ok(!sameProfile(`Rapport`, `Rapports`));
});
