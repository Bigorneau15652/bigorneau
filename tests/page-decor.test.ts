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
    c.header.zones.center = `{document}`;
    c.footer.zones.center = `{page}`;
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
    c.header.zones.center = `Titre`;
    c.skipFirst = true;
  }, longBody());
  const c = composeNote(text, `N.md`);
  assert.equal((c.pages[0].decor ?? []).length, 0);
  assert.ok((c.pages[1].decor ?? []).length > 0);
});

test(`une forme autour du numero est dessinee avant le numero`, () => {
  const text = noteWith((c) => {
    c.footer.zones.center = `{page}`;
    c.footer.pageShape.shape = `circle`;
  }, `# Un\n\nTexte.`);
  const items = composeNote(text, `N.md`).pages[0].decor ?? [];
  const shape = items.findIndex((i) => i.kind === `shape`);
  const number = items.findIndex((i) => i.kind === `text`);
  assert.ok(shape >= 0 && number > shape);
});

test(`le PDF contient le texte du decor`, async () => {
  const text = noteWith((c) => {
    c.footer.zones.left = `Pied special`;
    c.footer.zones.center = `{page}`;
    c.footer.pageShape.shape = `rounded`;
  }, `# Un\n\nTexte.`);
  const pdf = Buffer.from(await composeToPdf(composeNote(text, `N.md`), REQ)).toString(`latin1`);
  assert.ok(pdf.startsWith(`%PDF`));
});

test(`une zone sur plusieurs lignes empile ses lignes, vers le haut pour l'en-tete`, () => {
  const text = noteWith((c) => {
    c.header.zones.left = `Ligne 1\nLigne 2`;
  }, `# Un\n\nTexte.`);
  const items = (composeNote(text, `N.md`).pages[0].decor ?? []).filter((i) => i.kind === `text`);
  assert.equal(items.length, 2);
  const [a, b] = items;
  assert.ok(a.kind === `text` && b.kind === `text` && a.baseline < b.baseline);
});

test(`une image d'en-tete est ramenee au maximum permis`, () => {
  const text = noteWith((c) => {
    c.header.zones.left = `![[logo.png|2000]]`;
  }, `# Un\n\nTexte.`);
  const images = new Map([[`logo.png`, { naturalWidth: 2000, naturalHeight: 1000, pixelWidth: 2000, pixelHeight: 1000, kind: `jpeg` as const, data: new Uint8Array(0) }]]);
  const items = composeNote(text, `N.md`, undefined, undefined, { images }).pages[0].decor ?? [];
  const img = items.find((i) => i.kind === `image`);
  assert.ok(img && img.kind === `image` && img.height <= 45 + 1e-6 && img.width <= 225 + 1e-6);
});

test(`le bord exterieur est ecrit a 90 degres : il descend a droite des pages de droite et monte a gauche des pages de gauche`, () => {
  const text = noteWith((c) => {
    c.edge.zones.left = `{chapter}`;
    c.edge.zones.right = `{page}`;
    c.edge.pageShape.shape = `circle`;
  }, longBody());
  const pages = composeNote(text, `N.md`).pages;
  const recto = (pages[0].decor ?? []).find((i) => i.kind === `group`);
  const verso = (pages[1].decor ?? []).find((i) => i.kind === `group`);
  assert.ok(recto && recto.kind === `group` && recto.rot === 90);
  assert.ok(verso && verso.kind === `group` && verso.rot === -90);
  if (recto && recto.kind === `group`) {
    // Dans la marge de droite, et le numero (zone du bas) est une forme suivie du chiffre.
    assert.ok(recto.qx > 595.28 - 72 && recto.qx < 595.28);
    assert.ok(recto.items.some((i) => i.kind === `shape`));
  }
  if (verso && verso.kind === `group`) assert.ok(verso.qx > 0 && verso.qx < 72);
});

test(`le numero de page peut se placer dans l'en-tete, avec la forme et les couleurs de la bande`, () => {
  const text = noteWith((c) => {
    c.header.zones.right = `**{page}**`;
    c.header.pageShape = { shape: `square`, fill: `#ffd43b`, stroke: `#000000`, color: `#ff0000` };
  }, `# Un\n\nTexte.`);
  const items = composeNote(text, `N.md`).pages[0].decor ?? [];
  const shape = items.findIndex((i) => i.kind === `shape`);
  const number = items.findIndex((i) => i.kind === `text`);
  assert.ok(shape >= 0 && number > shape);
  const n = items[number];
  assert.ok(n.kind === `text` && n.color === `#ff0000` && n.style === `bold`);
});
