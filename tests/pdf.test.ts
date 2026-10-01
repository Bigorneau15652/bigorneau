import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync, inflateSync } from "node:zlib";
import { buildExportDoc } from "../src/export/doc-tree";
import { Page, paginate } from "../src/export/paginate";
import { buildPdf } from "../src/export/pdf";
import { A4_SETUP, DEFAULT_PAGE_STYLE, typesetDoc } from "../src/export/typeset";

const PARA = `Le bâtiment a été construit en 1972, l'office de tourisme et la difficile rénovation de l'*affiche* en témoignent ; sa consommation d'énergie finale reste **supérieure** à 180 kWh/m².an. Voir [le site](https://exemple.fr/a?b=1) ou https://autre.fr/x pour la méthode.`;

function note(chapters: number): string {
  const out: string[] = [`---`, `lang: fr`, `---`, `Introduction avec une note[^i].`, ``];
  for (let c = 1; c <= chapters; c++) {
    out.push(`# Chapitre ${c}`, ``, ...Array.from({ length: 6 }, () => `${PARA}\n`), `## Section ${c}.1`, ``, `${PARA}`, ``, `### Sous-section ${c}.1.1`, `- un`, `  - deux`, ``, `> citation`, ``);
  }
  out.push(`[^i]: Texte de la note d'introduction.`);
  return out.join(`\n`);
}

async function build(text: string, deflate = false): Promise<{ pdf: Uint8Array; pages: Page[]; titles: string[] }> {
  const t = typesetDoc(buildExportDoc(text, `Audit.md`));
  const pages = paginate(t, A4_SETUP, DEFAULT_PAGE_STYLE);
  const pdf = await buildPdf(pages, A4_SETUP, {
    title: `Audit énergétique`,
    author: `Olivier`,
    language: `fr-FR`,
    creator: `Mindmap Note Writing`,
    created: new Date(`2026-10-01T15:00:00Z`),
    ...(deflate ? { deflate: async (d: Uint8Array) => new Uint8Array(deflateSync(d)) } : {}),
  });
  return { pdf, pages, titles: t.rows.filter((r) => r.heading).map((r) => r.heading!.title) };
}

// Lecteur minimal des PDF ecrits par le plugin (leur mise en forme est connue).
class Reader {
  readonly s: string;
  constructor(readonly bytes: Uint8Array) {
    this.s = Buffer.from(bytes).toString(`latin1`);
  }
  size(): number {
    return Number(/\/Size (\d+)/.exec(this.s.slice(this.s.lastIndexOf(`trailer`)))![1]);
  }
  object(id: number): string {
    const m = new RegExp(`(?:^|\\n)${id} 0 obj\\n([\\s\\S]*?)\\nendobj\\n`).exec(this.s);
    assert.ok(m, `objet ${id} absent`);
    return m![1];
  }
  // Contenu d'un flux, decompresse si besoin.
  stream(id: number): string {
    const o = this.object(id);
    const start = o.indexOf(`stream\n`) + 7;
    const end = o.lastIndexOf(`\nendstream`);
    const raw = Buffer.from(o.slice(start, end), `latin1`);
    return (/\/FlateDecode/.test(o) ? inflateSync(raw) : raw).toString(`latin1`);
  }
  ref(dict: string, key: string): number {
    const m = new RegExp(`/${key} (\\d+) 0 R`).exec(dict);
    assert.ok(m, `${key} absent`);
    return Number(m![1]);
  }
}

function decodeTitle(hex: string): string {
  let out = ``;
  for (let i = 4; i < hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return out;
}

// Texte de chaque page d'apres les flux de contenu et les tables ToUnicode.
function pageTexts(r: Reader): string[] {
  const out: string[] = [];
  for (let id = 1; id < r.size(); id++) {
    const o = r.object(id);
    if (!/\/Type \/Page /.test(o)) continue;
    const resources = o;
    const fonts = new Map<string, Map<number, string>>();
    for (const m of resources.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
      const type0 = r.object(Number(m[2]));
      const cmap = r.stream(r.ref(type0, `ToUnicode`));
      const map = new Map<number, string>();
      for (const e of cmap.matchAll(/<([0-9a-f]{4})> <([0-9a-f]+)>/g)) {
        let t = ``;
        for (let i = 0; i < e[2].length; i += 4) t += String.fromCharCode(parseInt(e[2].slice(i, i + 4), 16));
        map.set(parseInt(e[1], 16), t);
      }
      fonts.set(m[1], map);
    }
    const content = r.stream(r.ref(o, `Contents`));
    let text = ``;
    for (const bt of content.matchAll(/BT \/(F\d+) [\d.]+ Tf [-\d.]+ [-\d.]+ Td \[([^\]]*)\] TJ ET/g)) {
      const map = fonts.get(bt[1])!;
      for (const h of bt[2].matchAll(/<([0-9a-f]+)>/g)) for (let i = 0; i < h[1].length; i += 4) text += map.get(parseInt(h[1].slice(i, i + 4), 16)) ?? `?`;
    }
    out.push(text);
  }
  return out;
}

test(`structure du fichier : en-tete, table des references, objets et references valides`, async () => {
  const { pdf, pages } = await build(note(2));
  const r = new Reader(pdf);
  assert.ok(r.s.startsWith(`%PDF-1.7\n`));
  assert.ok(r.s.trimEnd().endsWith(`%%EOF`));
  // La table des references pointe sur les objets.
  const xrefPos = Number(/startxref\n(\d+)\n%%EOF/.exec(r.s)![1]);
  assert.ok(r.s.startsWith(`xref\n`, xrefPos));
  const size = r.size();
  const entries = [...r.s.slice(xrefPos).matchAll(/(\d{10}) (\d{5}) ([nf]) \n/g)];
  assert.equal(entries.length, size);
  entries.slice(1).forEach((e, i) => assert.ok(r.s.startsWith(`${i + 1} 0 obj\n`, Number(e[1])), `objet ${i + 1}`));
  // Chaque reference designe un objet qui existe.
  for (const m of r.s.matchAll(/(\d+) 0 R/g)) assert.ok(Number(m[1]) < size && Number(m[1]) >= 1, `reference ${m[1]}`);
  assert.equal([...r.s.matchAll(/\/Type \/Page /g)].length, pages.length);
  assert.ok(new RegExp(`/Count ${pages.length}`).test(r.s));
});

test(`metadonnees, langue et ouverture sur les signets`, async () => {
  const { pdf } = await build(note(1));
  const r = new Reader(pdf);
  const info = r.object(r.ref(r.s.slice(r.s.lastIndexOf(`trailer`)), `Info`));
  assert.ok(info.includes(`/Author (Olivier)`));
  assert.ok(info.includes(`/CreationDate (D:20261001150000Z)`));
  const cat = r.object(r.ref(r.s.slice(r.s.lastIndexOf(`trailer`)), `Root`));
  assert.ok(cat.includes(`/PageMode /UseOutlines`));
  assert.ok(cat.includes(`/Lang (fr-FR)`));
  assert.ok(/\/Title <FEFF/.test(info) || info.includes(`/Title`));
});

test(`les polices sont incorporees, avec leur table ToUnicode`, async () => {
  const { pdf } = await build(note(1));
  const r = new Reader(pdf);
  const names = [...r.s.matchAll(/\/BaseFont \/(\S+)/g)].map((m) => m[1]);
  for (const n of [`MMWSRG+LibertinusSerif-Regular`, `MMWSIT+LibertinusSerif-Italic`, `MMWSBD+LibertinusSerif-Bold`]) assert.ok(names.includes(n), n);
  assert.equal([...r.s.matchAll(/\/FontFile3 \d+ 0 R/g)].length, new Set(names).size);
  assert.ok(r.s.includes(`/Subtype /CIDFontType0C`));
});

test(`le texte du PDF est celui des lignes, ligatures comprises`, async () => {
  const { pdf, pages } = await build(note(2));
  const texts = pageTexts(new Reader(pdf));
  assert.equal(texts.length, pages.length);
  pages.forEach((p, i) => {
    // Ordre d'ecriture : corps, notes, en-tete, numero.
    const expected = [
      ...p.rows.flatMap((r) => (r.kind === `space` ? [] : [r.marker && r.kind !== `footnote` ? r.marker : ``, r.text])),
      ...p.footnotes.flatMap((r) => [r.marker ?? ``, r.text]),
      p.header ?? ``,
      p.footer ?? ``,
    ].join(``);
    assert.equal(texts[i].replace(/\s/g, ``), expected.replace(/\s/g, ``), `page ${i + 1}`);
  });
  // Les ligatures du texte sont des ligatures de la police, et le texte copie reste « office ».
  assert.ok(texts.join(``).includes(`office`));
  assert.ok(texts.join(``).includes(`difficile`));
});

test(`les signets reprennent les titres, imbriques selon leur niveau`, async () => {
  const { pdf, titles } = await build(note(2));
  const r = new Reader(pdf);
  const root = r.object(r.ref(r.object(r.ref(r.s.slice(r.s.lastIndexOf(`trailer`)), `Root`)), `Outlines`));
  const walk = (id: number, depth: number, out: { title: string; depth: number }[]): void => {
    for (let cur: number | null = id; cur !== null; ) {
      const o = r.object(cur);
      out.push({ title: decodeTitle(/\/Title <([0-9A-F]+)>/i.exec(o)?.[1] ?? /\/Title \(([^)]*)\)/.exec(o)![1].split(``).map((c) => `00${c.charCodeAt(0).toString(16)}`.slice(-4)).join(``).replace(/^/, `FEFF`)), depth });
      if (/\/First/.test(o)) walk(r.ref(o, `First`), depth + 1, out);
      cur = /\/Next (\d+) 0 R/.test(o) ? r.ref(o, `Next`) : null;
    }
  };
  const flat: { title: string; depth: number }[] = [];
  walk(r.ref(root, `First`), 0, flat);
  assert.deepEqual(flat.map((f) => f.title), titles);
  // La note est la racine, les chapitres sont ses enfants, les sections et sous-sections s'emboitent.
  assert.deepEqual(flat.slice(0, 5).map((f) => f.depth), [0, 1, 2, 3, 1]);
  assert.equal(Number(/\/Count (\d+)/.exec(root)![1]), titles.length);
  // Chaque signet mene a une page et une position.
  assert.equal([...r.s.matchAll(/\/Dest \[\d+ 0 R \/XYZ/g)].length, titles.length);
});

test(`les liens web sont cliquables et se regroupent par ligne`, async () => {
  const { pdf, pages } = await build(note(1));
  const r = new Reader(pdf);
  const uris = [...r.s.matchAll(/\/URI \(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(uris.includes(`https://exemple.fr/a?b=1`));
  assert.ok(uris.includes(`https://autre.fr/x`));
  assert.ok(uris.length >= 2 * pages.length - 2);
  for (const m of r.s.matchAll(/\/Rect \[([^\]]*)\]/g)) {
    const [x1, y1, x2, y2] = m[1].split(` `).map(Number);
    assert.ok(x2 > x1 && y2 > y1);
  }
});

test(`avec compression, le fichier reste lisible et plus petit`, async () => {
  const plain = await build(note(2));
  const packed = await build(note(2), true);
  assert.ok(packed.pdf.length < plain.pdf.length);
  assert.deepEqual(pageTexts(new Reader(packed.pdf)), pageTexts(new Reader(plain.pdf)));
});

test(`un document vide donne un PDF d'une page avec le titre en signet`, async () => {
  const { pdf, pages, titles } = await build(``);
  assert.equal(pages.length, 1);
  assert.deepEqual(titles, [`Audit`]);
  assert.ok(new Reader(pdf).s.includes(`/Type /Outlines`));
});
