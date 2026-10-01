import { test } from "node:test";
import assert from "node:assert/strict";
import { appearanceDefaults, DEFAULT_SETTINGS, migrateSettings, SETTINGS_VERSION } from "../src/settings";

test(`reglages : valeurs par defaut quand rien n est enregistre`, () => {
  assert.deepEqual(migrateSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(migrateSettings(null), DEFAULT_SETTINGS);
  assert.equal(DEFAULT_SETTINGS.includeSubtitles, false);
});

test(`reglages : le chapitre actif ne comprend plus les sous-titres apres migration`, () => {
  const old = { includeSubtitles: true, contrastEnabled: true, inactiveOpacity: 0.3 };
  const s = migrateSettings(old);
  assert.equal(s.includeSubtitles, false);
  assert.equal(s.inactiveOpacity, 0.3);
  assert.equal(s.settingsVersion, SETTINGS_VERSION);
});

test(`reglages : un choix fait apres la migration est conserve`, () => {
  const s = migrateSettings({ settingsVersion: SETTINGS_VERSION, includeSubtitles: true });
  assert.equal(s.includeSubtitles, true);
});

test(`reglages : anciens reglages de contour et de branches`, () => {
  assert.equal(migrateSettings({ frameStyle: `none` }).showFrames, false);
  assert.equal(migrateSettings({ frameStyle: `straight` }).corners, `sharp`);
  assert.equal(migrateSettings({ frameStyle: `rounded` }).roughness, 0);
  assert.equal(migrateSettings({ branchStyle: `sketch` }).branchStyle, `elbow`);
  assert.equal(migrateSettings({ branchStyle: `curve` }).branchStyle, `curve`);
  const s = migrateSettings({ frameStyle: `sketch`, paragraphMode: `simple`, paneSize: 300 }) as unknown as Record<string, unknown>;
  assert.equal(`frameStyle` in s, false);
  assert.equal(`paragraphMode` in s, false);
  assert.equal(`paneSize` in s, false);
});

test(`reglages : l apparence par defaut couvre tous les reglages d apparence`, () => {
  const d = appearanceDefaults() as Record<string, unknown>;
  assert.equal(d.roughness, 1);
  assert.equal(d.strokeColor, ``);
  assert.equal(Object.keys(d).length, 12);
  assert.equal(d.shape, `frame`);
});

test(`reglages : auteur du PDF vide par defaut, nettoye quand il est enregistre`, () => {
  assert.equal(DEFAULT_SETTINGS.exportAuthor, ``);
  assert.equal(migrateSettings({ exportAuthor: `  Ada  ` }).exportAuthor, `Ada`);
  assert.equal(migrateSettings({ exportAuthor: 42 }).exportAuthor, ``);
  assert.equal(DEFAULT_SETTINGS.exportFloats, `float`);
  assert.equal(DEFAULT_SETTINGS.exportPageRefs, false);
  assert.equal(migrateSettings({ exportFloats: `inline` }).exportFloats, `inline`);
  assert.equal(migrateSettings({ exportFloats: `autre` }).exportFloats, `float`);
  assert.equal(migrateSettings({ exportPageRefs: true }).exportPageRefs, true);
  assert.equal(migrateSettings({ exportPageRefs: `oui` }).exportPageRefs, false);
});
