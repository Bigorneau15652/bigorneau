import { test } from "node:test";
import assert from "node:assert/strict";
import { calloutColors, calloutKindOf, calloutPaint, defaultCalloutTitle, formatCalloutOverride, parseCalloutHead, parseCalloutOverride } from "../src/export/callout";
import { composeNote, composeToPdf } from "../src/export/compose";
import { buildExportDoc } from "../src/export/doc-tree";
import { renderHtml } from "../src/export/html/html-doc";
import { DEFAULT_PAGE_STYLE } from "../src/export/typeset";

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
  assert.ok(html.includes(`class="callout callout-tip callout-look-color"`));
  assert.ok(html.includes(`<span>Astuce utile</span>`));
  assert.ok(html.includes(`<li>`) && html.includes(`une puce`));
  assert.ok(!html.includes(`[!tip]`));
});

test(`callout : chaque type a son pictogramme et le titre est decale a droite de lui`, async () => {
  const { CALLOUT_ICONS, iconPdfPath } = await import(`../src/export/callout-icons`);
  for (const kind of Object.keys(CALLOUT_ICONS) as (keyof typeof CALLOUT_ICONS)[]) {
    const ops = iconPdfPath(kind);
    assert.ok(/ m /.test(` ${ops}`) && !/NaN|undefined/.test(ops), kind);
  }
  const c = composeNote(`> [!note] Un titre\n> Du texte.\n`, `N.md`);
  const title = c.typeset.rows.find((r) => r.calloutIcon !== undefined);
  assert.ok(title && title.calloutIcon!.kind === `note` && title.x > title.calloutIcon!.x + title.calloutIcon!.size);
  const nested = composeNote(`> [!note] Dehors\n>\n> > [!danger] Dedans\n> > Texte.\n`, `N.md`);
  const icons = nested.typeset.rows.filter((r) => r.calloutIcon !== undefined);
  assert.equal(icons.length, 2);
  assert.ok(icons[1].calloutIcon!.x > icons[0].calloutIcon!.x);
});

test(`callout : la page HTML met le pictogramme devant le titre`, () => {
  const html = renderHtml(buildExportDoc(`> [!warning] Attention\n> Texte\n`, `Note.md`), { images: new Map(), formulas: new Map() }).html;
  assert.ok(/<div class="callout-titre"><svg class="callout-icone"[^>]*><path d="M 12 3.5/.test(html));
  assert.ok(html.includes(`<span>Attention</span>`));
});

test(`callout : lecture et ecriture de la ligne de commentaire qui choisit l'aspect`, () => {
  assert.deepEqual(parseCalloutOverride(`bw`), { mode: `bw` });
  assert.deepEqual(parseCalloutOverride(` Noir et Blanc `), { mode: `bw` });
  assert.deepEqual(parseCalloutOverride(`couleur`), { mode: `color` });
  assert.deepEqual(parseCalloutOverride(`#3366CC`), { mode: `color`, color: `#3366cc` });
  assert.deepEqual(parseCalloutOverride(`#36c`), { mode: `color`, color: `#3366cc` });
  assert.equal(parseCalloutOverride(`n'importe quoi`), null);
  assert.equal(parseCalloutOverride(`#12`), null);
  for (const o of [{ mode: `bw` as const }, { mode: `color` as const }, { mode: `color` as const, color: `#3366cc` }]) {
    const line = formatCalloutOverride(o);
    const spec = /%% callout: (.*) %%/.exec(line)![1];
    assert.deepEqual(parseCalloutOverride(spec), o);
  }
});

test(`callout : aspect choisi par l'export puis par le callout`, () => {
  assert.equal(calloutPaint(`tip`, `color`).look, `color`);
  assert.equal(calloutPaint(`tip`, `color`, { mode: `bw` }).look, `gray`);
  assert.equal(calloutPaint(`tip`, `frame`, { mode: `bw` }).look, `frame`);
  assert.equal(calloutPaint(`tip`, `frame`, { mode: `color` }).look, `color`);
  const custom = calloutPaint(`tip`, `bar`, { mode: `color`, color: `#336699` });
  assert.ok(custom.look === `color` && custom.bar === `#336699`);
  const frame = calloutPaint(`note`, `frame`);
  assert.ok(frame.frame === `#000000` && frame.fill === `` && frame.bar === ``);
  const gray = calloutPaint(`note`, `gray`);
  assert.ok(gray.bar === `#000000` && gray.fill !== `` && gray.frame === ``);
  const bar = calloutPaint(`note`, `bar`);
  assert.ok(bar.bar === `#000000` && bar.fill === `` && bar.frame === ``);
});

test(`callout : la ligne de commentaire n'est jamais imprimee et fixe l'aspect`, () => {
  const doc = buildExportDoc(`> [!tip] Titre\n> %% callout: bw %%\n> Texte.\n\n> [!note] Autre\n> Texte.\n\n> Citation\n> %% callout: bw %%\n> suite\n`, `N.md`);
  const first = doc.blocks[0];
  assert.ok(first.type === `callout` && first.override?.mode === `bw` && first.blocks.length === 1);
  const second = doc.blocks[1];
  assert.ok(second.type === `callout` && second.override === undefined);
  const quote = doc.blocks[2];
  assert.ok(quote.type === `quote` && !quote.text.includes(`callout`) && !/[\u0002\u0003]/.test(quote.text));
});

test(`callout : les lignes d'un callout en cadre portent les bords haut et bas aux extremites`, () => {
  const c = composeNote(`> [!note] Titre\n> Un.\n>\n> Deux.\n`, `N.md`, undefined, { ...DEFAULT_PAGE_STYLE, callouts: `frame` });
  const rows = c.typeset.rows.filter((r) => r.callouts !== undefined);
  assert.ok(rows.length >= 3);
  assert.equal(rows[0].callouts![0].top, true);
  assert.equal(rows[rows.length - 1].callouts![0].bottom, true);
  assert.ok(rows.slice(1).every((r) => r.callouts![0].top !== true));
  assert.ok(rows.every((r) => r.callouts![0].fill === `` && r.callouts![0].frame === `#000000`));
});

test(`callout : la page HTML suit l'aspect de l'export et celui du callout`, () => {
  const note = `> [!tip] Un\n> a\n\n> [!tip] Deux\n> %% callout: color %%\n> b\n`;
  const html = renderHtml(buildExportDoc(note, `Note.md`), { images: new Map(), formulas: new Map(), callouts: `frame` }).html;
  assert.ok(html.includes(`callout callout-tip callout-look-frame`));
  assert.ok(html.includes(`callout callout-tip callout-look-color`));
  assert.ok(!html.includes(`callout:`));
});
