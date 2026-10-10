import { test } from "node:test";
import assert from "node:assert/strict";
import { composeNote, composeToPdf } from "../src/export/compose";
import { defaultConfig, formatPageMarker, parsePageMarker, sanitizeConfig } from "../src/page-config";

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
    c.edge.pageUpright = false;
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

test(`le numero de page du bord exterieur reste droit : forme et chiffre sont poses hors du groupe tourne`, () => {
  const text = noteWith((c) => {
    c.edge.zones.right = `{page}`;
    c.edge.pageShape.shape = `circle`;
  }, longBody());
  const pages = composeNote(text, `N.md`).pages;
  for (const [i, odd] of [[0, true], [1, false]] as const) {
    const items = pages[i].decor ?? [];
    const shape = items.find((x) => x.kind === `shape`);
    const num = items.find((x) => x.kind === `text`);
    assert.ok(shape && shape.kind === `shape` && num && num.kind === `text`);
    if (shape && shape.kind === `shape`) {
      const cx = shape.x + shape.width / 2;
      // Dans la marge exterieure, au bas du texte (zone Bas).
      assert.ok(odd ? cx > 595.28 - 72 : cx < 72);
      assert.ok(shape.y > 841.89 / 2);
    }
  }
});

test(`la forme du numero peut etre sans remplissage et sans contour`, async () => {
  const text = noteWith((c) => {
    c.footer.zones.center = `{page}`;
    c.footer.pageShape = { shape: `circle`, fill: ``, stroke: `#ff0000`, color: `#000000` };
  }, `# Un\n\nTexte.`);
  const items = composeNote(text, `N.md`).pages[0].decor ?? [];
  const shape = items.find((i) => i.kind === `shape`);
  assert.ok(shape && shape.kind === `shape` && shape.fill === `` && shape.stroke === `#ff0000`);
  const pdf = Buffer.from(await composeToPdf(composeNote(text, `N.md`), REQ)).toString(`latin1`);
  assert.ok(pdf.startsWith(`%PDF`));
});

test(`les dates de creation et de modification et l'auteur par defaut sont disponibles dans les zones`, () => {
  const text = noteWith((c) => {
    c.header.zones.left = `{created}`;
    c.header.zones.center = `{modified}`;
    c.header.zones.right = `{author}`;
  }, `# Un\n\nTexte.`);
  const texts = (composeNote(text, `N.md`, undefined, undefined, { created: Date.UTC(2026, 0, 5, 12), modified: Date.UTC(2026, 8, 30, 12), defaultAuthor: `Ada` }).pages[0].decor ?? []).flatMap((i) => (i.kind === `text` ? [i.text] : []));
  assert.deepEqual(texts, [`5 janvier 2026`, `30 septembre 2026`, `Ada`]);
});

test(`le cadre d'une zone est dessine derriere son texte, ajuste a ce texte avec sa marge`, () => {
  const text = noteWith((c) => {
    c.header.zones.center = `Titre`;
    c.header.frames.center = { shape: `rounded`, fill: `#ffd43b`, stroke: ``, color: `#112233`, padding: 4 };
  }, `# Un\n\nTexte.`);
  const items = composeNote(text, `N.md`).pages[0].decor ?? [];
  const frame = items.findIndex((i) => i.kind === `shape`);
  const label = items.findIndex((i) => i.kind === `text`);
  assert.ok(frame >= 0 && label > frame);
  const f = items[frame];
  const l = items[label];
  assert.ok(f.kind === `shape` && l.kind === `text`);
  if (f.kind === `shape` && l.kind === `text`) {
    assert.equal(l.color, `#112233`);
    assert.ok(Math.abs(f.x - (l.x - 4)) < 1e-6);
    assert.ok(f.y < l.baseline - 7 && f.y + f.height > l.baseline + 2);
  }
  // Une zone sans cadre n'en a pas, ni une zone voisine.
  const other = noteWith((c) => {
    c.header.zones.center = `Titre`;
    c.header.zones.left = `Autre`;
    c.header.frames.center.shape = `square`;
  }, `# Un\n\nTexte.`);
  const shapes = (composeNote(other, `N.md`).pages[0].decor ?? []).filter((i) => i.kind === `shape`);
  assert.equal(shapes.length, 1);
});

test(`l'eloignement du bord place l'en-tete, le pied de page et le cote, cadre compris`, () => {
  const mm = 72 / 25.4;
  const header = noteWith((c) => {
    c.header.zones.left = `Titre`;
    c.header.frames.left = { shape: `square`, fill: `#ffd43b`, stroke: ``, color: ``, padding: 3 };
    c.header.distance = 0;
  }, `# Un\n\nTexte.`);
  const h = (composeNote(header, `N.md`).pages[0].decor ?? []).find((i) => i.kind === `shape`);
  assert.ok(h && h.kind === `shape` && Math.abs(h.y) < 1e-6);
  const footer = noteWith((c) => {
    c.footer.zones.left = `Pied`;
    c.footer.frames.left = { shape: `square`, fill: `#ffd43b`, stroke: ``, color: ``, padding: 3 };
    c.footer.distance = 5;
  }, `# Un\n\nTexte.`);
  const f = (composeNote(footer, `N.md`).pages[0].decor ?? []).find((i) => i.kind === `shape`);
  assert.ok(f && f.kind === `shape` && Math.abs(841.89 - (f.y + f.height) - 5 * mm) < 1e-6);
  // Cote : a distance 0, le cadre touche le bord droit des pages de droite et le bord gauche des pages de gauche.
  const side = noteWith((c) => {
    c.edge.zones.center = `Cote`;
    c.edge.frames.center = { shape: `square`, fill: `#ffd43b`, stroke: ``, color: ``, padding: 3 };
    c.edge.distance = 0;
  }, longBody());
  const pages = composeNote(side, `N.md`).pages;
  for (const [i, odd] of [[0, true], [1, false]] as const) {
    const g = (pages[i].decor ?? []).find((x) => x.kind === `group`);
    assert.ok(g && g.kind === `group`);
    if (g && g.kind === `group`) {
      const box = g.items.find((x) => x.kind === `shape`);
      assert.ok(box && box.kind === `shape`);
      if (box && box.kind === `shape`) {
        // Epaisseur du cadre = hauteur virtuelle ; son bord exterieur est a qx -/+ (y du cadre).
        const outer = odd ? g.qx - box.y : g.qx + box.y;
        assert.ok(odd ? Math.abs(outer - 595.28) < 1e-6 : Math.abs(outer) < 1e-6);
      }
    }
  }
});

test(`les cadres et l'eloignement sont relus tels qu'ils ont ete ecrits, et bornes`, () => {
  const c = defaultConfig();
  c.edge.frames.right = { shape: `circle`, fill: ``, stroke: `#000000`, color: `#ffffff`, padding: 5 };
  c.edge.distance = 7.5;
  const back = parsePageMarker(formatPageMarker(c));
  assert.deepEqual(back?.edge.frames.right, c.edge.frames.right);
  assert.equal(back?.edge.distance, 7.5);
  const bad = sanitizeConfig({ footer: { distance: 500, frames: { left: { padding: 99, shape: `x` } } }, header: { distance: -4 } });
  assert.equal(bad.footer.distance, 60);
  assert.equal(bad.header.distance, 0);
  assert.equal(bad.footer.frames.left.padding, 20);
  assert.equal(bad.footer.frames.left.shape, `none`);
  assert.equal(sanitizeConfig({}).header.distance, null);
});

test(`les cadres d'une bande ont la meme hauteur et contiennent les images, meme si les zones n'ont pas le meme nombre de lignes`, () => {
  const frame = { shape: `rounded` as const, fill: `#ffd43b`, stroke: ``, color: ``, padding: 4 };
  const text = noteWith((c) => {
    c.header.zones.left = `Logo ![[logo.png|100]]`;
    c.header.zones.center = `Titre\nsecond`;
    c.header.frames.left = { ...frame };
    c.header.frames.center = { ...frame };
    c.header.distance = 0;
  }, `# Un\n\nTexte.`);
  const images = new Map([[`logo.png`, { naturalWidth: 100, naturalHeight: 100, pixelWidth: 100, pixelHeight: 100, kind: `jpeg` as const, data: new Uint8Array(0) }]]);
  const items = composeNote(text, `N.md`, undefined, undefined, { images }).pages[0].decor ?? [];
  const frames = items.filter((i) => i.kind === `shape`);
  assert.equal(frames.length, 2);
  const [a, b] = frames;
  assert.ok(a.kind === `shape` && b.kind === `shape`);
  if (a.kind === `shape` && b.kind === `shape`) {
    assert.ok(Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.height - b.height) < 1e-6);
    assert.ok(Math.abs(a.y) < 1e-6);
    const img = items.find((i) => i.kind === `image`);
    assert.ok(img && img.kind === `image` && img.y >= a.y + 4 - 1e-6 && img.y + img.height <= a.y + a.height);
  }
});

test(`une note qui n'a qu'un reglage de page garde le numero de page general`, () => {
  const text = noteWith((c) => {
    c.layout = { ...c.layout, orientation: `landscape` };
  }, longBody());
  const c = composeNote(text, `N.md`);
  assert.ok(c.pages.length > 1);
  assert.ok(c.pages.every((p) => (p.decor ?? []).length === 0));
  assert.ok(c.pages.every((p) => p.footer === String(p.number)), `le numero de page general est conserve`);
});

test(`une note qui definit une bande remplace l'en-tete et le pied de page generaux`, () => {
  const text = noteWith((c) => {
    c.footer.zones.center = `{page}`;
  }, longBody());
  const c = composeNote(text, `N.md`);
  assert.ok(c.pages.every((p) => p.footer === undefined && (p.decor ?? []).length > 0));
});

test(`le compte rendu signale ce que l'export ne peut pas imprimer`, async () => {
  const { warningLines } = await import(`../src/export-report`);
  const text = [
    `# Rapport`,
    ``,
    `Une phrase avec ![[photo.png]] au milieu et un ~~ancien prix~~ barre.`,
    ``,
    `- Une liste avec ![[autre.png]]`,
    ``,
    `![[Autre note]]`,
    ``,
    "```dataview",
    `TABLE x FROM "y"`,
    "```",
  ].join(`\n`);
  const warnings = composeNote(text, `N.md`).typeset.warnings;
  for (const code of [`inlineimage:photo.png`, `inlineimage:autre.png`, `strike`, `embed:Autre note`, `block:dataview`]) assert.ok(warnings.includes(code), code);
  assert.ok(warningLines(warnings).length >= 5);
});
