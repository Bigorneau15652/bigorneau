import { test } from "node:test";
import assert from "node:assert/strict";
import { composeNote, composeToPdf } from "../src/export/compose";

const REQ = { creator: `Mindmap Note Writing`, created: new Date(`2026-10-01T15:00:00Z`) };
const text = (s: string): string => Buffer.from(s, `latin1`).toString(`latin1`);

test(`la note devient des pages avec sa langue, son auteur et son titre`, () => {
  const c = composeNote(`---\nlang: en\nauthor: Ada\n---\n# One\nSome text.`, `Report.md`);
  assert.equal(c.language, `en-GB`);
  assert.equal(c.author, `Ada`);
  assert.equal(c.title, `Report`);
  assert.ok(c.pages.length >= 1);
  assert.equal(composeNote(`# Un\nTexte.`, `N.md`).language, `fr-FR`);
});

test(`l'auteur du PDF vient de la note, sinon des reglages, sinon il est absent`, async () => {
  const withNote = text(Buffer.from(await composeToPdf(composeNote(`---\nauthor: Ada\n---\n# A`, `N.md`), { ...REQ, defaultAuthor: `Reglage` })).toString(`latin1`));
  assert.ok(withNote.includes(`/Author (Ada)`));
  const fromSettings = Buffer.from(await composeToPdf(composeNote(`# A`, `N.md`), { ...REQ, defaultAuthor: `Reglage` })).toString(`latin1`);
  assert.ok(fromSettings.includes(`/Author (Reglage)`));
  const none = Buffer.from(await composeToPdf(composeNote(`# A`, `N.md`), REQ)).toString(`latin1`);
  assert.ok(!none.includes(`/Author`));
});

test(`l'apercu et le PDF partagent les memes pages`, async () => {
  const c = composeNote(`# Un\n\nTexte du premier chapitre.\n\n# Deux\n\nTexte du second.`, `N.md`);
  const pdf = Buffer.from(await composeToPdf(c, REQ)).toString(`latin1`);
  assert.equal([...pdf.matchAll(/\/Type \/Page /g)].length, c.pages.length);
});
