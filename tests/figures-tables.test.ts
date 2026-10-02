import { test } from "node:test";
import assert from "node:assert/strict";
import { composeNote, composeToPdf } from "../src/export/compose";
import { buildExportDoc } from "../src/export/doc-tree";
import { displaySize, ImageAsset, isImageTarget, targetPixels } from "../src/export/image";
import { anchorPages, paginate } from "../src/export/paginate";
import { A4_SETUP, DEFAULT_PAGE_STYLE, typesetDoc } from "../src/export/typeset";
import { columnWidths } from "../src/export/table";

const PARA = `Le bâtiment a été construit en 1972 et sa consommation d'énergie finale reste aujourd'hui supérieure à 180 kWh/m².an ; une rénovation globale suppose d'abord une analyse précise : isolation des murs et de la toiture, remplacement des menuiseries, régulation du chauffage et ventilation double flux.`;
const INLINE = { ...DEFAULT_PAGE_STYLE, floats: `inline` as const };
const REQ = { creator: `Bigorneau`, created: new Date(`2026-10-01T15:00:00Z`) };

function image(w = 400, h = 200): ImageAsset {
  return { naturalWidth: w, naturalHeight: h, pixelWidth: 2, pixelHeight: 2, kind: `rgb`, data: new Uint8Array(12), alpha: new Uint8Array(4) };
}

function paras(n: number): string {
  return Array.from({ length: n }, () => `${PARA}\n`).join(`\n`);
}

test(`les largeurs de colonnes gardent la largeur naturelle quand le tableau tient`, () => {
  assert.deepEqual(columnWidths([100, 50], [20, 20], 300), [100, 50]);
});

test(`les largeurs de colonnes se partagent selon le gain possible et respectent le minimum`, () => {
  const w = columnWidths([400, 100, 40], [30, 30, 30], 300);
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 300) < 1e-6);
  assert.ok(w[0] > w[1] && w[1] > w[2]);
  assert.ok(w.every((x, i) => x >= [30, 30, 30][i] - 1e-9));
  // Minimum trop grand : tout est reduit proportionnellement.
  const tight = columnWidths([400, 400], [200, 200], 300);
  assert.deepEqual(tight, [150, 150]);
});

test(`un tableau est compose en lignes de cellules avec filets, en-tete en gras et alignements`, () => {
  const t = typesetDoc(buildExportDoc(`# A\n\n| Poste | kWh |\n| :-- | --: |\n| Chauffage | 120 |\n| Éclairage | 15 |`, `A.md`), A4_SETUP, undefined, INLINE);
  const rows = t.rows.filter((r) => r.kind === `table`);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].rules?.top, true);
  assert.equal(rows[0].rules?.bottom, true);
  assert.equal(rows[1].rules?.bottom, undefined);
  assert.equal(rows[2].rules?.bottom, true);
  assert.equal(rows[0].cells?.[0].runs[0].style, `bold`);
  assert.equal(rows[1].cells?.[0].runs[0].style, `regular`);
  // Colonne de droite alignee a droite : les deux nombres finissent au meme endroit.
  const end = (i: number): number => {
    const c = rows[i].cells?.[1];
    return (c?.x ?? 0) + (c?.width ?? 0);
  };
  assert.ok(Math.abs(end(1) - end(2)) < 0.01);
  // L'en-tete reste avec la premiere rangee.
  assert.ok(rows[0].breakAfter >= 10000);
  assert.ok(rows[1].breakAfter < 10000);
});

test(`une cellule longue est retournee a la ligne et sa rangee reste d'un seul tenant`, () => {
  const long = Array.from({ length: 30 }, () => `isolation`).join(` `);
  const t = typesetDoc(buildExportDoc(`# A\n\n| a | b |\n| - | - |\n| ${long} | court |\n| x | y |`, `A.md`), A4_SETUP, undefined, INLINE);
  const rows = t.rows.filter((r) => r.kind === `table`);
  assert.ok(rows.length > 4);
  const body = rows.slice(1, -1);
  assert.ok(body.length > 2);
  assert.ok(body.slice(0, -1).every((r) => r.breakAfter >= 10000));
  assert.ok(rows.every((r) => (r.cells ?? []).every((c) => c.x + c.width <= r.width + 0.01)));
  assert.ok(Math.abs(rows[0].width - (A4_SETUP.width - 144)) < 0.5 || rows[0].width <= A4_SETUP.width - 144);
});

test(`la legende d'un tableau est numerotee et placee au-dessus`, () => {
  const t = typesetDoc(buildExportDoc(`# A\n\nTableau : Consommations par poste\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nTable suivante.\n\nTableau : Seconde\n\n| c |\n| - |\n| 3 |`, `A.md`), A4_SETUP, undefined, INLINE);
  const kinds = t.rows.map((r) => r.kind);
  const cap = t.rows.filter((r) => r.kind === `caption`);
  assert.equal(cap.length, 2);
  assert.ok(cap[0].text.startsWith(`Tableau 1`));
  assert.ok(cap[0].text.includes(`Consommations par poste`));
  assert.ok(cap[1].text.startsWith(`Tableau 2`));
  assert.ok(kinds.indexOf(`caption`) < kinds.indexOf(`table`));
  assert.equal(cap[0].runs?.[0].style, `bold`);
  assert.ok(/Tableau 1 :/.test(cap[0].text));
});

test(`en anglais les legendes s'appellent Table et Figure, avec deux-points collee`, () => {
  const t = typesetDoc(buildExportDoc(`---\nlang: en\n---\n# A\n\nTable: Energy\n\n| a |\n| - |\n| 1 |\n\n![[p.png|Site plan]]`, `A.md`), A4_SETUP, undefined, INLINE, { images: new Map([[`p.png`, image()]]) });
  const cap = t.rows.filter((r) => r.kind === `caption`).map((r) => r.text);
  assert.equal(cap[0], `Table 1: Energy`);
  assert.equal(cap[1], `Figure 1: Site plan`);
});

test(`la figure prend sa taille naturelle plafonnee a la colonne, ou la largeur demandee`, () => {
  const set = (width?: number): number => {
    const t = typesetDoc(buildExportDoc(`# A\n\n![[p.png|Plan${width ? `|${width}` : ``}]]`, `A.md`), A4_SETUP, undefined, INLINE, { images: new Map([[`p.png`, image(400, 200)]]) });
    return (t.rows.find((r) => r.image) as { image: { width: number } }).image.width;
  };
  assert.equal(set(), 300);
  assert.equal(set(200), 150);
  const big = typesetDoc(buildExportDoc(`# A\n\n![[p.png|Plan]]`, `A.md`), A4_SETUP, undefined, INLINE, { images: new Map([[`p.png`, image(2000, 500)]]) });
  const r = big.rows.find((x) => x.image) as { image: { width: number; height: number } };
  assert.ok(Math.abs(r.image.width - (A4_SETUP.width - 144)) < 1e-6);
  assert.ok(Math.abs(r.image.height / r.image.width - 0.25) < 1e-9);
});

test(`les calculs de taille d'image respectent la page et les 300 dpi`, () => {
  const d = displaySize(1000, 4000, undefined, 450, 500);
  assert.ok(d.height <= 500 + 1e-9 && Math.abs(d.height / d.width - 4) < 1e-9);
  assert.equal(targetPixels(5000, 72), 300);
  assert.equal(targetPixels(100, 72), 100);
  assert.ok(isImageTarget(`a/b.PNG`) && isImageTarget(`x.svg?raw`) && !isImageTarget(`x.mp4`));
});

test(`une image absente, du web ou un autre media est remplacee par un repere et signalee`, () => {
  const t = typesetDoc(buildExportDoc(`# A\n\n![[absent.png|Perdue]]\n\n![Web](https://exemple.fr/a.png)\n\n![[film.mp4]]`, `A.md`), A4_SETUP, undefined, INLINE);
  const texts = t.rows.filter((r) => r.kind === `figure`).map((r) => r.text);
  assert.ok(texts[0].includes(`Image introuvable`) && texts[0].includes(`absent.png`));
  assert.ok(texts[1].includes(`Image du web`));
  assert.equal(texts.length, 2);
  assert.ok(t.rows.some((r) => r.kind === `media` && r.text.includes(`film.mp4`)));
  assert.ok(t.warnings.includes(`image:absent.png`));
  assert.ok(t.warnings.includes(`webimage:https://exemple.fr/a.png`));
  assert.ok(t.warnings.includes(`media:film.mp4`));
});

test(`en mode flottant, la figure est un repere dans le texte et se place en haut de page`, () => {
  const text = `# A\n\n${paras(3)}\n![[p.png|Plan]]\n\n${paras(2)}`;
  const doc = buildExportDoc(text, `A.md`);
  const t = typesetDoc(doc, A4_SETUP, undefined, DEFAULT_PAGE_STYLE, { images: new Map([[`p.png`, image()]]) });
  assert.equal(t.rows.filter((r) => r.float).length, 1);
  assert.ok(!t.rows.some((r) => r.image));
  const pages = paginate(t, A4_SETUP, DEFAULT_PAGE_STYLE);
  const all = pages.flatMap((p) => [...(p.topFloats ?? []), ...(p.bottomFloats ?? [])]);
  assert.equal(all.filter((r) => r.image).length, 1);
  assert.equal(all.filter((r) => r.kind === `caption`).length, 1);
  // Aucune page ne depasse la hauteur disponible, flottants et notes compris.
  const avail = A4_SETUP.height - 144;
  for (const p of pages) {
    const h = [...(p.topFloats ?? []), ...p.rows, ...(p.bottomFloats ?? [])].reduce((a, r) => a + r.height, 0) + (p.footnotes.length > 0 ? 12 + p.footnotes.reduce((a, r) => a + r.height, 0) : 0);
    assert.ok(h <= avail + 1e-6, `page ${p.number} : ${h}`);
  }
});

test(`en mode integre, la figure reste dans le texte et aucune page n'a de flottant`, () => {
  const text = `# A\n\n${paras(3)}\n![[p.png|Plan]]\n\n${paras(2)}`;
  const t = typesetDoc(buildExportDoc(text, `A.md`), A4_SETUP, undefined, INLINE, { images: new Map([[`p.png`, image()]]) });
  const pages = paginate(t, A4_SETUP, INLINE);
  assert.ok(pages.every((p) => !p.topFloats && !p.bottomFloats));
  assert.equal(pages.flatMap((p) => p.rows).filter((r) => r.image).length, 1);
});

test(`les flottants gardent leur ordre et attendent quand la page est pleine`, () => {
  const imgs = new Map([[`a.png`, image(500, 500)], [`b.png`, image(500, 500)], [`c.png`, image(500, 500)]]);
  const text = `# A\n\n![[a.png|Premiere]]\n\n![[b.png|Seconde]]\n\n![[c.png|Troisieme]]\n\n${paras(2)}`;
  const t = typesetDoc(buildExportDoc(text, `A.md`), A4_SETUP, undefined, DEFAULT_PAGE_STYLE, { images: imgs });
  const pages = paginate(t, A4_SETUP, DEFAULT_PAGE_STYLE);
  const order = pages.flatMap((p) => [...(p.topFloats ?? []), ...(p.bottomFloats ?? [])]).filter((r) => r.kind === `caption`).map((r) => r.text.slice(0, 8));
  assert.deepEqual(order, [`Figure 1`, `Figure 2`, `Figure 3`]);
  // Pas deux figures de 450 pt sur une page de 698 pt.
  assert.ok(pages.every((p) => [...(p.topFloats ?? []), ...(p.bottomFloats ?? [])].filter((r) => r.image).length <= 1));
});

test(`un flottant place apres une page bien remplie va en bas de page`, () => {
  const t = typesetDoc(buildExportDoc(`# A\n\n${paras(5)}\n![[p.png|Plan]]\n\nSuite.`, `A.md`), A4_SETUP, undefined, DEFAULT_PAGE_STYLE, { images: new Map([[`p.png`, image(300, 100)]]) });
  const pages = paginate(t, A4_SETUP, DEFAULT_PAGE_STYLE);
  assert.ok(pages.some((p) => (p.bottomFloats ?? []).some((r) => r.image)) || pages.some((p) => (p.topFloats ?? []).some((r) => r.image)));
});

test(`un tableau long est coupe entre deux rangees avec son en-tete repete et ses filets`, () => {
  const rows = Array.from({ length: 70 }, (_, i) => `| ligne ${i} | ${i} |`).join(`\n`);
  const t = typesetDoc(buildExportDoc(`# A\n\n| Poste | Valeur |\n| - | - |\n${rows}`, `A.md`), A4_SETUP, undefined, DEFAULT_PAGE_STYLE);
  assert.ok(!t.rows.some((r) => r.float));
  const pages = paginate(t, A4_SETUP, DEFAULT_PAGE_STYLE);
  assert.ok(pages.length >= 2);
  const tables = pages.map((p) => p.rows.filter((r) => r.kind === `table`));
  // Chaque page de tableau commence par l'en-tete et finit par un filet.
  for (const tr of tables.filter((x) => x.length > 0)) {
    assert.equal(tr[0].cells?.[0].text, `Poste`);
    assert.equal(tr[0].rules?.top, true);
    assert.equal(tr[tr.length - 1].rules?.bottom, true);
  }
  // Les 70 rangees se retrouvent une seule fois chacune.
  const bodies = tables.flatMap((x) => x.filter((r) => r.cells?.[0].text.startsWith(`ligne`)));
  assert.equal(bodies.length, 70);
});

test(`les renvois vers un titre ou une figure sont cliquables et la table des matieres donne les bonnes pages`, () => {
  const text = `---\ntoc: true\n---\n# Premier\n\n${paras(4)}\nVoir [[#Second]] et la [[#^plan]].\n\n# Second\n\n${paras(3)}\n![[p.png|Plan du site]] ^plan\n\n## Detail\n\n${paras(2)}`;
  const c = composeNote(text, `A.md`, A4_SETUP, DEFAULT_PAGE_STYLE, { images: new Map([[`p.png`, image()]]) });
  const map = anchorPages(c.pages);
  const toc = c.typeset.rows.filter((r) => r.toc && r.toc.page >= 0);
  assert.equal(toc.length, 3);
  assert.deepEqual(toc.map((r) => r.toc?.anchor), [`hid:1`, `hid:2`, `hid:3`]);
  for (const r of toc) assert.equal(r.toc?.page, map.get(r.toc?.anchor as string));
  assert.ok(toc.every((r) => (r.toc?.page ?? 0) >= 1));
  const links = c.typeset.rows.flatMap((r) => r.runs ?? []).filter((r) => r.link?.startsWith(`#`));
  assert.deepEqual([...new Set(links.map((r) => r.link))].sort(), [`#b:plan`, `#hid:2`]);
  assert.ok(c.typeset.rows.some((r) => r.runs?.some((u) => u.text === `Figure` && u.link === `#b:plan`)));
  assert.ok(map.has(`b:plan`));
});

test(`sans la propriete toc, aucune table des matieres n'est produite`, () => {
  const c = composeNote(`# A\n\nTexte.\n\n## B\n\nTexte.`, `A.md`);
  assert.ok(!c.typeset.rows.some((r) => r.toc));
});

test(`l'option page ajoute le numero de page aux renvois`, () => {
  const text = `# A\n\nVoir [[#B]].\n\n# B\n\nTexte.`;
  const c = composeNote(text, `A.md`, A4_SETUP, { ...DEFAULT_PAGE_STYLE, pageRefs: true });
  const joined = c.typeset.rows.map((r) => r.text).join(` `);
  assert.ok(joined.includes(`B (page 1)`), joined);
});

test(`un renvoi vers une cible absente est signale`, () => {
  const c = composeNote(`# A\n\nVoir [[#Nulle part]].`, `A.md`);
  assert.ok(c.typeset.warnings.includes(`renvoi:Nulle part`));
});

test(`le PDF contient l'image, ses destinations internes et les filets du tableau`, async () => {
  const text = `# Premier\n\nVoir [[#Second]].\n\n![[p.png|Plan]] ^plan\n\nTableau : Valeurs\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n# Second\n\nTexte avec renvoi [[#^plan]].`;
  const c = composeNote(text, `A.md`, A4_SETUP, DEFAULT_PAGE_STYLE, { images: new Map([[`p.png`, image()]]) });
  const pdf = Buffer.from(await composeToPdf(c, REQ)).toString(`latin1`);
  assert.ok(/\/Subtype \/Image \/Width 2 \/Height 2 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/SMask \d+ 0 R/.test(pdf));
  assert.ok(/\/XObject << \/Im1 \d+ 0 R >>/.test(pdf));
  assert.ok(/\/Dest \[\d+ 0 R \/XYZ/.test(pdf));
  assert.equal([...pdf.matchAll(/\/Subtype \/Link[^>]*\/Dest/g)].length >= 2, true);
  assert.ok(pdf.includes(` Do Q`));
});

test(`une image JPEG est ecrite telle quelle`, async () => {
  const jpeg: ImageAsset = { naturalWidth: 10, naturalHeight: 10, pixelWidth: 10, pixelHeight: 10, kind: `jpeg`, data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) };
  const c = composeNote(`# A\n\n![[p.jpg|Photo]]`, `A.md`, A4_SETUP, DEFAULT_PAGE_STYLE, { images: new Map([[`p.jpg`, jpeg]]) });
  const pdf = Buffer.from(await composeToPdf(c, REQ)).toString(`latin1`);
  assert.ok(pdf.includes(`/Filter /DCTDecode /Length 4`));
});

test(`l'en-tete d'un JPEG donne ses dimensions et ses composantes`, async () => {
  const { jpegInfo } = await import(`../src/export/image`);
  // SOI, APP0 (longueur 4), SOF0 : 3 composantes, 100 lignes, 200 colonnes.
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0xc8, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(jpegInfo(bytes), { width: 200, height: 100, components: 3 });
  assert.equal(jpegInfo(new Uint8Array([1, 2, 3, 4])), null);
});

test(`les flottants places a la fin du texte restent sur la derniere page quand ils y tiennent`, () => {
  const t = typesetDoc(buildExportDoc(`# A\n\nTexte court.\n\nTableau : Fin\n\n| a |\n| - |\n| 1 |\n\n![[p.png|Plan]]`, `A.md`), A4_SETUP, undefined, DEFAULT_PAGE_STYLE, { images: new Map([[`p.png`, image(300, 100)]]) });
  const pages = paginate(t, A4_SETUP, DEFAULT_PAGE_STYLE);
  assert.equal(pages.length, 1);
  assert.equal((pages[0].topFloats ?? []).filter((r) => r.kind === `caption`).length, 2);
});

test(`un tableau dont l'identifiant suit une ligne vide est trouve par les renvois`, () => {
  const c = composeNote(`# A\n\nVoir [[#^conso]].\n\nTableau : Valeurs\n\n| a |\n| - |\n| 1 |\n\n^conso`, `A.md`);
  assert.deepEqual(c.typeset.warnings, []);
  assert.ok(c.typeset.rows.some((r) => r.runs?.some((u) => u.text === `Tableau` && u.link === `#b:conso`)));
});
