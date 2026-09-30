import { test } from "node:test";
import assert from "node:assert/strict";
import { comboLabel, comboMatches, eventToCombo, KeyLike } from "../src/keys";

const ev = (key: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

test(`touches : Mod correspond a Cmd sur Mac et a Ctrl ailleurs`, () => {
  assert.equal(eventToCombo(ev(`ArrowUp`, { metaKey: true }), true), `Mod-ArrowUp`);
  assert.equal(eventToCombo(ev(`ArrowUp`, { ctrlKey: true }), false), `Mod-ArrowUp`);
  assert.equal(eventToCombo(ev(`ArrowUp`, { ctrlKey: true }), true), `Ctrl-ArrowUp`);
  assert.equal(eventToCombo(ev(`ArrowUp`, { metaKey: true }), false), `Meta-ArrowUp`);
});

test(`touches : modificateurs multiples et lettres`, () => {
  assert.equal(eventToCombo(ev(`j`, { ctrlKey: true, shiftKey: true }), false), `Mod-Shift-J`);
  assert.equal(eventToCombo(ev(`ArrowDown`, { ctrlKey: true, altKey: true }), false), `Mod-Alt-ArrowDown`);
  assert.equal(eventToCombo(ev(`ArrowDown`), false), `ArrowDown`);
});

test(`touches : reconnaissance d une combinaison`, () => {
  assert.ok(comboMatches(ev(`ArrowLeft`, { ctrlKey: true }), `Mod-ArrowLeft`, false));
  assert.ok(!comboMatches(ev(`ArrowLeft`), `Mod-ArrowLeft`, false));
  assert.ok(!comboMatches(ev(`ArrowLeft`, { ctrlKey: true, shiftKey: true }), `Mod-ArrowLeft`, false));
  assert.ok(!comboMatches(ev(`ArrowLeft`, { ctrlKey: true }), ``, false));
});

test(`touches : libelles lisibles`, () => {
  assert.equal(comboLabel(`Mod-ArrowUp`, true), `Cmd + ↑`);
  assert.equal(comboLabel(`Mod-ArrowUp`, false), `Ctrl + ↑`);
  assert.equal(comboLabel(`Mod-Shift-J`, false), `Ctrl + Maj + J`);
  assert.equal(comboLabel(``, false), `Aucune`);
});

import { isModEnter } from "../src/keys";

test(`Cmd ou Ctrl + Entree : sans autre modificateur`, () => {
  const base = { key: `Enter`, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
  assert.equal(isModEnter({ ...base, metaKey: true }), true);
  assert.equal(isModEnter({ ...base, ctrlKey: true }), true);
  assert.equal(isModEnter(base), false);
  assert.equal(isModEnter({ ...base, metaKey: true, shiftKey: true }), false);
  assert.equal(isModEnter({ ...base, key: `a`, metaKey: true }), false);
});
