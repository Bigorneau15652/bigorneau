import { test } from "node:test";
import assert from "node:assert/strict";
import { safeFileName, API_VERSION, BigorneauApi, buildExternal, externalId, fingerprint, OfficialScript, ScriptHost, ScriptManager, ScriptState } from "../src/scripts";
import { runScript } from "../src/script-runner";
import { warningLines } from "../src/export-report";
import { FORMULAS_SCRIPT, MATH_SERVICE } from "../src/script-formulas";

const HEADER = (extra = ``) => `/* bigorneau-script\nname: Bonjour\nname-en: Hello\ndescription: Dit bonjour.\nversion: 1.2.0\napi: 1\n${extra}*/\n`;

function makeHost() {
  const log = { functions: [] as { id: string; available: () => boolean; needsEditor: boolean }[], notices: [] as string[], saves: 0, help: 0 };
  const host: ScriptHost = {
    app: {} as never,
    obsidian: {},
    language: () => `fr`,
    notice: (m) => void log.notices.push(m),
    registerFunction: (fn) => void log.functions.push(fn),
    addHelp: () => void log.help++,
    runExternal: (code, api, id) => runScript(code, api, id),
    saveState: () => void log.saves++,
  };
  return { host, log };
}

const official = (over: Partial<OfficialScript> = {}): OfficialScript => ({
  origin: `builtin`,
  id: `off`,
  name: { fr: `Officiel`, en: `Official` },
  description: { fr: ``, en: `` },
  version: `1.0.0`,
  api: API_VERSION,
  requires: [],
  defaultEnabled: false,
  load: () => undefined,
  ...over,
});

test(`l'en-tete d'un script est lu, et les erreurs sont nommees`, () => {
  const ok = buildHeader(HEADER());
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.meta.name.fr, `Bonjour`);
    assert.equal(ok.meta.name.en, `Hello`);
    assert.equal(ok.meta.version, `1.2.0`);
    assert.equal(ok.meta.id, `ext:bonjour`);
  }
  const noHeader = buildHeader(`console.log(1)`);
  assert.deepEqual(noHeader.ok ? null : noHeader.error, `header`);
  const noName = buildHeader(`/* bigorneau-script\napi: 1\n*/`);
  assert.deepEqual(noName.ok ? null : noName.error, `name`);
  const noApi = buildHeader(`/* bigorneau-script\nname: A\n*/`);
  assert.deepEqual(noApi.ok ? null : noApi.error, `api`);
});

import { parseScriptHeader } from "../src/scripts";
function buildHeader(code: string, file = `bonjour.js`) {
  return parseScriptHeader(code, file);
}

test(`l'identifiant d'un script ajoute vient de son fichier`, () => {
  assert.equal(externalId(`Mon script.js`), `ext:mon-script`);
  assert.equal(safeFileName(`C:\\dossier\\Mon script (1).js`), `Mon-script-1.js`);
  assert.equal(safeFileName(`../../x.JS`), `x.js`);
});

test(`l'empreinte change des qu'un caractere change`, async () => {
  const a = await fingerprint(`abc`);
  assert.equal(a, `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`);
  assert.notEqual(a, await fingerprint(`abd`));
});

test(`un script officiel respecte son etat par defaut puis celui de l'utilisateur`, async () => {
  const { host } = makeHost();
  const state: ScriptState = { enabled: {}, approved: {} };
  let loaded = 0;
  const m = new ScriptManager(host, state, [official({ load: () => void loaded++ })]);
  await m.loadEnabled();
  assert.equal(m.isEnabled(`off`), false);
  assert.equal(loaded, 0);
  await m.setEnabled(`off`, true);
  assert.equal(m.isEnabled(`off`), true);
  assert.equal(loaded, 1);
  assert.equal(state.enabled.off, true);
  await m.setEnabled(`off`, false);
  assert.equal(m.isEnabled(`off`), false);
});

test(`les fonctions d'un script desactive ne sont plus disponibles, et ses services disparaissent`, async () => {
  const { host, log } = makeHost();
  const m = new ScriptManager(host, { enabled: {}, approved: {} }, [
    official({
      load: (api: BigorneauApi) => {
        api.addFunction({ id: `f`, name: `F`, run: () => undefined });
        api.provide(`svc`, 42);
      },
    }),
  ]);
  await m.setEnabled(`off`, true);
  assert.equal(log.functions[0].id, `f`);
  assert.equal(log.functions[0].available(), true);
  assert.equal(m.service(`svc`), 42);
  await m.setEnabled(`off`, false);
  assert.equal(log.functions[0].available(), false);
  assert.equal(m.service(`svc`), undefined);
});

test(`un script exige ses prerequis, meme s'il vient avant eux dans la liste`, async () => {
  const { host } = makeHost();
  const order: string[] = [];
  const a = official({ id: `a`, requires: [`b`], load: () => void order.push(`a`) });
  const b = official({ id: `b`, load: () => void order.push(`b`) });
  const m = new ScriptManager(host, { enabled: { a: true }, approved: {} }, [a, b]);
  await m.loadEnabled();
  assert.deepEqual(order, []);
  assert.equal(m.info().find((i) => i.id === `a`)?.status, `blocked`);
  await m.setEnabled(`b`, true);
  assert.deepEqual(order, [`b`, `a`]);
});

test(`un script en erreur est signale sans empecher les autres`, async () => {
  const { host, log } = makeHost();
  const bad = official({ id: `bad`, load: () => { throw new Error(`boum`); } });
  let ok = false;
  const good = official({ id: `good`, load: () => void (ok = true) });
  const m = new ScriptManager(host, { enabled: { bad: true, good: true }, approved: {} }, [bad, good]);
  await m.loadEnabled();
  assert.equal(ok, true);
  assert.equal(m.info().find((i) => i.id === `bad`)?.status, `error`);
  assert.match(log.notices[0], /boum/);
});

test(`un script d'une autre version de l'interface n'est jamais charge`, async () => {
  const { host } = makeHost();
  let loaded = false;
  const m = new ScriptManager(host, { enabled: { off: true }, approved: {} }, [official({ api: 2, load: () => void (loaded = true) })]);
  await m.loadEnabled();
  assert.equal(loaded, false);
  assert.equal(m.info()[0].status, `incompatible`);
});

test(`un script ajoute a la main attend la confirmation, puis s'execute, puis redemande si le fichier change`, async () => {
  const { host, log } = makeHost();
  const state: ScriptState = { enabled: {}, approved: {} };
  const m = new ScriptManager(host, state, []);
  const code = HEADER() + `bigorneau.addFunction({ id: "salut", name: "Salut", run: () => bigorneau.notice("bonjour") });`;
  const built = await buildExternal(`bonjour.js`, code);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  m.setExternal([built.script]);
  assert.equal(m.info()[0].status, `needs-confirmation`);
  await m.loadEnabled();
  assert.equal(log.functions.length, 0);
  await m.approve(built.script);
  assert.equal(m.isEnabled(`ext:bonjour`), true);
  // L'identifiant de la fonction porte le nom du script.
  assert.equal(log.functions[0].id, `bonjour-salut`);
  // Le fichier est modifie : l'ancienne confirmation ne vaut plus.
  const changed = await buildExternal(`bonjour.js`, code + `\n// modifie`);
  assert.equal(changed.ok, true);
  if (!changed.ok) return;
  m.setExternal([changed.script]);
  assert.equal(m.isEnabled(`ext:bonjour`), false);
  assert.equal(m.info()[0].status, `modified`);
  m.remove(`ext:bonjour`);
  assert.equal(state.approved[`ext:bonjour`], undefined);
});

test(`une erreur de syntaxe dans un script ajoute est signalee`, async () => {
  const { host } = makeHost();
  const m = new ScriptManager(host, { enabled: {}, approved: {} }, []);
  const built = await buildExternal(`casse.js`, HEADER() + `let = ;`);
  if (!built.ok) throw new Error(`en-tete`);
  await m.approve(built.script);
  assert.equal(m.info()[0].status, `error`);
});

test(`le script Formules fournit le rendu et ses deux fonctions seulement une fois active`, async () => {
  const { host, log } = makeHost();
  const m = new ScriptManager(host, { enabled: {}, approved: {} }, [FORMULAS_SCRIPT]);
  await m.loadEnabled();
  assert.equal(log.functions.length, 0);
  assert.equal(m.service(MATH_SERVICE), undefined);
  assert.equal(m.isEnabled(`formulas`), false);
  await m.setEnabled(`formulas`, true);
  assert.deepEqual(log.functions.map((f) => f.id), [`insert-inline-math`, `insert-block-math`]);
  assert.equal(typeof m.service(MATH_SERVICE), `function`);
  assert.ok(log.functions.every((f) => f.needsEditor && f.available()));
});

test(`le rapport d'export regroupe les formules quand le script Formules est desactive`, () => {
  const w = [`formule:a`, `formule:b`, `image:x.png`];
  const on = warningLines(w, { formulasEnabled: true });
  assert.equal(on.length, 3);
  const off = warningLines(w, { formulasEnabled: false });
  assert.equal(off.length, 2);
  assert.ok(off.some((l) => /Formules/.test(l)));
});

test(`le script d'exemple de la documentation se lit et se charge`, async () => {
  const { readFileSync } = await import(`node:fs`);
  const code = readFileSync(`docs/exemples/bonjour.js`, `utf8`);
  const { host, log } = makeHost();
  const m = new ScriptManager(host, { enabled: {}, approved: {} }, []);
  const built = await buildExternal(`bonjour.js`, code);
  if (!built.ok) throw new Error(`en-tete`);
  await m.approve(built.script);
  assert.equal(m.info()[0].status, `ok`);
  assert.deepEqual(log.functions.map((f) => [f.id, f.needsEditor]), [[`bonjour-salut`, false], [`bonjour-date`, true]]);
  assert.equal(log.help, 1);
});
