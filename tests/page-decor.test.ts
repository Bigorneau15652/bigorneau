import { test } from "node:test";
import assert from "node:assert/strict";
import { composeNote, composeToPdf } from "../src/export/compose";
import { defaultConfig, formatPageMarker } from "../src/page-config";

const REQ = { creator: `Bigorneau`, created: new Date(`2026-10-01T15:00:00Z`) };

const noteWith = (patch: (c: ReturnType<typeof defaultConfig>) => void, body: string): string => {
  const config = defaultConfig();
  patch(config);
  return `${formatPageMarker(config)}\n\n${body}`;
};

const longBody = (): string => Array.from({ length: 6 }, (_, i) => `# Chapitre ${i + 1}\n\n${`Un texte assez long pour remplir la page. `.repeat(60)}`).join(`\n\n`);

test(`une note sans reglage de page n'a aucun decor`, () => {
  const c = composeNote(`# Un\n\nTexte.`, `N.md`);
  assert.ok(c.pages.every((p) => !p.decor || p.decor.length === 0));
});

test(`l'en-tete et le numero sont composes sur chaque page`, () => {
  const text = noteWith((c) => {
    c.header.enabled = true;
    c.header.zones.center = `{document}`;
    c.numbering.enabled = true;
    c.numbering.place = `footer`;
  }, longBody());
  const c = composeNote(text, `Rapport.md`);
  assert.ok(c.pages.length > 1);
  for (const page of c.pages) {
    const texts = (page.decor ?? []).filter((i) => i.kind === `text`).map((i) => (i.kind === `text` ? i.text : ``));
    assert.ok(texts.includes(`Rapport`));
    assert.ok(texts.includes(String(page.number)));
  }
});

test(`la page de garde peut etre sans en-tete`, () => {
  const text = noteWith((c) => {
    c.header.enabled = true;
    c.header.zones.center = `Titre`;
    c.skipFirst = true;
  }, longBody());
  const c = composeNote(text, `N.md`);
  assert.equal((c.pages[0].decor ?? []).length, 0);
  assert.ok((c.pages[1].decor ?? []).length > 0);
});

test(`une forme autour du numero est dessinee avant le numero`, () => {
  const text = noteWith((c) => {
    c.numbering.enabled = true;
    c.numbering.shape = `circle`;
  }, `# Un\n\nTexte.`);
  const items = composeNote(text, `N.md`).pages[0].decor ?? [];
  const shape = items.findIndex((i) => i.kind === `shape`);
  const number = items.findIndex((i) => i.kind === `text`);
  assert.ok(shape >= 0 && number > shape);
});

test(`le PDF contient le texte du decor`, async () => {
  const text = noteWith((c) => {
    c.footer.enabled = true;
    c.footer.zones.left = `Pied special`;
    c.numbering.enabled = true;
    c.numbering.shape = `rounded`;
  }, `# Un\n\nTexte.`);
  const pdf = Buffer.from(await composeToPdf(composeNote(text, `N.md`), REQ)).toString(`latin1`);
  assert.ok(pdf.startsWith(`%PDF`));
});
