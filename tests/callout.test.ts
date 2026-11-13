import { test } from "node:test";
import assert from "node:assert/strict";
import { calloutColors, calloutKindOf, defaultCalloutTitle, parseCalloutHead } from "../src/export/callout";
import { composeNote, composeToPdf } from "../src/export/compose";
import { buildExportDoc } from "../src/export/doc-tree";
import { renderHtml } from "../src/export/html/html-doc";

const NOTE = `# Titre\n\nAvant.\n\n> [!tip] Astuce utile\n> Premier paragraphe du callout.\n>\n> - une puce\n> - une autre\n\nApres.\n`;

test(`callout : lecture de la premiere ligne, types, alias et titre par defaut`, () => {
  assert.equal(parseCalloutHead(`[!note]`)?.title, `Note`);
  assert.equal(parseCalloutHead(`[!tip] Mon titre`)?.title, `Mon titre`);
  assert.equal(parseCalloutHead(`[!warning]- Replie`)?.fold, `closed`);
  assert.equal(parseCalloutHead(`[!warning]+ Ouvert`)?.fold, `open`);
  assert.equal(parseCalloutHead(`Une citation normale`), null);
  assert.equal(calloutKindOf(`HINT`), `tip`);
  assert.equal(calloutKindOf(`caution`), `warning`);
  assert.equal(calloutKindOf(`mon-type`), `note`);
  assert.equal(defaultCalloutTitle(`mon-type`), `Mon type`);
  const c = calloutColors(`danger`);
  assert.ok(/^#[0-9a-f]{6}$/.test(c.bar) && /^#[0-9a-f]{6}$/.test(c.fill) && /^#[0-9a-f]{6}$/.test(c.ink));
});

test(`callout : l'arbre du document le distingue d'une citation`, () => {
  const doc = buildExportDoc(`> [!tip] Astuce\n> Texte\n>\n> - a\n> - b\n\n> Citation simple\n\n> [!note]\n> > [!danger] Dedans\n> > Alerte\n`, `N.md`);
  const types = doc.blocks.map((b) => b.type);
  assert.deepEqual(types, [`callout`, `quote`, `callout`]);
  const first = doc.blocks[0];
  assert.ok(first.type === `callout` && first.kind === `tip` && first.title === `Astuce`);
  assert.deepEqual(first.type === `callout` ? first.blocks.map((b) => b.type) : [], [`paragraph`, `list`]);
  const outer = doc.blocks[2];
  assert.ok(outer.type === `callout` && outer.blocks[0].type === `callout` && outer.blocks[0].kind === `danger`);
});

test(`callout : les images, tableaux et formules en bloc sont imprimes comme texte et signales`, () => {
  const doc = buildExportDoc(`> [!note] Titre\n> ![[photo.png|Une photo]]\n>\n> | a | b |\n> |---|---|\n> | 1 | 2 |\n`, `N.md`);
  const b = doc.blocks[0];
  assert.ok(b.type === `callout`);
  if (b.type !== `callout`) return;
  assert.deepEqual(b.degraded, [`figure`, `table`]);
  assert.ok(b.blocks.every((x) => x.type === `paragraph`));
});

test(`callout : les lignes composees portent le cadre et sont decalees`, () => {
  const c = composeNote(NOTE, `N.md`);
  const rows = c.typeset.rows;
  const inside = rows.filter((r) => r.callouts !== undefined);
  assert.ok(inside.length >= 4, `titre, paragraphe et deux puces`);
  assert.ok(inside.every((r) => r.x >= 11 && r.callouts![0].width > 100));
  // The title is in bold colour and stays with what follows.
  assert.ok(inside[0].text.includes(`Astuce utile`));
  assert.ok(inside[0].color !== undefined && inside[0].breakAfter >= 10000);
  // The text before and after is not in the box.
  assert.ok(rows.filter((r) => r.text.startsWith(`Avant`) || r.text.startsWith(`Apres`)).every((r) => r.callouts === undefined));
});

test(`callout : un callout imbrique est decale deux fois et le PDF se produit`, async () => {
  const c = composeNote(`> [!note] Dehors\n> Texte dehors.\n>\n> > [!danger] Dedans\n> > Texte dedans.\n`, `N.md`);
  const nested = c.typeset.rows.filter((r) => (r.callouts?.length ?? 0) === 2);
  assert.ok(nested.length >= 2);
  assert.ok(nested[0].callouts![1].x > nested[0].callouts![0].x);
  const bytes = await composeToPdf(c, { creator: `Bigorneau`, created: new Date(`2026-10-01T15:00:00Z`) });
  const pdf = Buffer.from(bytes).toString(`latin1`);
  assert.ok(pdf.startsWith(`%PDF`));
});

test(`callout : un contenu non pris en charge est signale dans le compte rendu`, () => {
  const c = composeNote(`> [!note] T\n> ![[x.png|Legende]]\n`, `N.md`);
  assert.ok(c.typeset.warnings.includes(`callout:figure`));
});

test(`callout : la page HTML dessine le cadre avec sa couleur et son titre`, () => {
  const html = renderHtml(buildExportDoc(NOTE, `Note.md`), { images: new Map(), formulas: new Map() }).html;
  assert.ok(html.includes(`class="callout callout-tip"`));
  assert.ok(html.includes(`<div class="callout-titre">Astuce utile</div>`));
  assert.ok(html.includes(`<li>`) && html.includes(`une puce`));
  assert.ok(!html.includes(`[!tip]`));
});
