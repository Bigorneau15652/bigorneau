import { test } from "node:test";
import assert from "node:assert/strict";
import { BigorneauApi, OfficialScript, ScriptHost, ScriptManager, ScriptState } from "../src/scripts";
import { warningLines } from "../src/export-report";
import { FORMULAS_SCRIPT, MATH_SERVICE } from "../src/script-formulas";

function makeHost() {
  const log = { functions: [] as { id: string; available: () => boolean; needsEditor: boolean }[], notices: [] as string[], saves: 0, help: 0 };
  const host: ScriptHost = {
    app: {} as never,
    obsidian: {},
    language: () => `fr`,
    notice: (m) => void log.notices.push(m),
    registerFunction: (fn) => void log.functions.push(fn),
    addHelp: () => void log.help++,
    saveState: () => void log.saves++,
  };
  return { host, log };
}

const official = (over: Partial<OfficialScript> = {}): OfficialScript => ({
  id: `off`,
  name: { fr: `Officiel`, en: `Official` },
  description: { fr: ``, en: `` },
  version: `1.0.0`,
  requires: [],
  defaultEnabled: false,
  load: () => undefined,
  ...over,
});

test(`a built-in module follows its default state, then the choice of the user`, async () => {
  const { host } = makeHost();
  const state: ScriptState = { enabled: {} };
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

test(`the functions of a module that is turned off are no longer available and its services disappear`, async () => {
  const { host, log } = makeHost();
  const m = new ScriptManager(host, { enabled: {} }, [
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

test(`a module waits for its requirements, even when it comes before them in the list`, async () => {
  const { host } = makeHost();
  const order: string[] = [];
  const a = official({ id: `a`, requires: [`b`], load: () => void order.push(`a`) });
  const b = official({ id: `b`, load: () => void order.push(`b`) });
  const m = new ScriptManager(host, { enabled: { a: true } }, [a, b]);
  await m.loadEnabled();
  assert.deepEqual(order, []);
  assert.equal(m.info().find((i) => i.id === `a`)?.status, `blocked`);
  await m.setEnabled(`b`, true);
  assert.deepEqual(order, [`b`, `a`]);
});

test(`a module that fails is reported without stopping the others`, async () => {
  const { host, log } = makeHost();
  const bad = official({ id: `bad`, load: () => { throw new Error(`boum`); } });
  let ok = false;
  const good = official({ id: `good`, load: () => void (ok = true) });
  const m = new ScriptManager(host, { enabled: { bad: true, good: true } }, [bad, good]);
  await m.loadEnabled();
  assert.equal(ok, true);
  assert.equal(m.info().find((i) => i.id === `bad`)?.status, `error`);
  assert.match(log.notices[0], /boum/);
});

test(`binding another state makes the manager follow it (after a profile is loaded)`, async () => {
  const { host } = makeHost();
  let loaded = 0;
  const m = new ScriptManager(host, { enabled: {} }, [official({ load: () => void loaded++ })]);
  await m.loadEnabled();
  assert.equal(loaded, 0);
  m.bindState({ enabled: { off: true } });
  assert.equal(m.isEnabled(`off`), true);
  await m.loadEnabled();
  assert.equal(loaded, 1);
});

test(`the Formulas module provides the drawing and its functions only once it is on`, async () => {
  const { host, log } = makeHost();
  const m = new ScriptManager(host, { enabled: {} }, [FORMULAS_SCRIPT]);
  await m.loadEnabled();
  assert.equal(log.functions.length, 0);
  assert.equal(m.service(MATH_SERVICE), undefined);
  assert.equal(m.isEnabled(`formulas`), false);
  await m.setEnabled(`formulas`, true);
  assert.deepEqual(log.functions.map((f) => f.id), [`edit-formula`, `insert-inline-math`, `insert-block-math`]);
  assert.equal(typeof m.service(MATH_SERVICE), `function`);
  assert.equal(typeof m.service(`math.svg`), `function`);
  assert.ok(log.help >= 1);
  assert.ok(log.functions.every((f) => f.needsEditor && f.available()));
  // Only the editor has a button; the two commands keep their identifiers without a button.
  assert.deepEqual(log.functions.map((f) => (f as { button?: boolean }).button !== false), [true, false, false]);
});

test(`the export report groups the formulas when the Formulas module is off`, () => {
  const w = [`formule:a`, `formule:b`, `image:x.png`];
  const on = warningLines(w, { formulasEnabled: true });
  assert.equal(on.length, 3);
  const off = warningLines(w, { formulasEnabled: false });
  assert.equal(off.length, 2);
  assert.ok(off.some((l) => /Formules/.test(l)));
});

test(`the plugin never turns text into code (no dynamic code evaluation in the sources)`, async () => {
  const { readdirSync, readFileSync } = await import(`node:fs`);
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(`${dir}/${e.name}`) : e.name.endsWith(`.ts`) ? [`${dir}/${e.name}`] : []));
  for (const file of files(`src`)) {
    const code = readFileSync(file, `utf8`).replace(/\/\/.*$/gm, ``).replace(/\/\*[\s\S]*?\*\//g, ``);
    assert.ok(!/\bnew\s+Function\s*\(/.test(code) && !/\beval\s*\(/.test(code), `${file} must not evaluate text as code`);
  }
});
