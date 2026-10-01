// Outil de developpement (non execute par le plugin) : lit une police WOFF (TrueType compresse) et ecrit
// src/export/font-libertinus.ts, qui contient la police (en base 64, pour l'afficher) et la largeur de chaque caractere
// (pour calculer la mise en page). Usage : node tools/make-font-data.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const SOURCE = `tools/libertinus-serif-latin-400-normal.woff`;
const OUT = `src/export/font-libertinus.ts`;

const buf = readFileSync(SOURCE);
const num = buf.readUInt16BE(12);
const tables = {};
for (let i = 0; i < num; i++) {
  const o = 44 + 20 * i;
  const tag = buf.toString(`latin1`, o, o + 4);
  const off = buf.readUInt32BE(o + 4);
  const compLen = buf.readUInt32BE(o + 8);
  const origLen = buf.readUInt32BE(o + 12);
  const raw = buf.subarray(off, off + compLen);
  tables[tag] = compLen < origLen ? inflateSync(raw) : raw;
}

const head = tables[`head`];
const unitsPerEm = head.readUInt16BE(18);
const hhea = tables[`hhea`];
const ascender = hhea.readInt16BE(4);
const descender = hhea.readInt16BE(6);
const numHMetrics = hhea.readUInt16BE(34);
const hmtx = tables[`hmtx`];
const advance = (gid) => hmtx.readUInt16BE(4 * Math.min(gid, numHMetrics - 1));

// cmap : sous-table de format 4 (plan multilingue de base) ou 12.
const cmap = tables[`cmap`];
const nSub = cmap.readUInt16BE(2);
const map = new Map();
for (let i = 0; i < nSub; i++) {
  const off = cmap.readUInt32BE(4 + 8 * i + 4);
  const format = cmap.readUInt16BE(off);
  if (format === 4) {
    const segX2 = cmap.readUInt16BE(off + 6);
    const endO = off + 14;
    const startO = endO + segX2 + 2;
    const deltaO = startO + segX2;
    const rangeO = deltaO + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = cmap.readUInt16BE(endO + 2 * s);
      const start = cmap.readUInt16BE(startO + 2 * s);
      const delta = cmap.readInt16BE(deltaO + 2 * s);
      const ro = cmap.readUInt16BE(rangeO + 2 * s);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let gid;
        if (ro === 0) gid = (c + delta) & 0xffff;
        else {
          const g = cmap.readUInt16BE(rangeO + 2 * s + ro + 2 * (c - start));
          gid = g === 0 ? 0 : (g + delta) & 0xffff;
        }
        if (gid !== 0) map.set(c, gid);
      }
    }
  }
}

const pairs = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([c, g]) => [c, advance(g)]);
const b64 = buf.toString(`base64`);

const out = [
  `// Fichier genere par tools/make-font-data.mjs : ne pas modifier a la main.`,
  `// Police Libertinus Serif (graisse normale), sous-ensemble latin, licence SIL Open Font License 1.1 (voir licences/).`,
  `// Les largeurs sont exprimees en unites de la police (voir FONT_UNITS_PER_EM).`,
  `export const FONT_UNITS_PER_EM = ${unitsPerEm};`,
  `export const FONT_ASCENDER = ${ascender};`,
  `export const FONT_DESCENDER = ${descender};`,
  `// Paires [point de code, largeur d avance].`,
  `export const FONT_WIDTHS: [number, number][] = [${pairs.map(([c, w]) => `[${c},${w}]`).join(`,`)}];`,
  `// Police au format WOFF, en base 64.`,
  `export const FONT_WOFF_BASE64 = \`${b64}\`;`,
  ``,
].join(`\n`);
writeFileSync(OUT, out);
console.log(`${pairs.length} caracteres, ${unitsPerEm} unites par em, ${Math.round(b64.length / 1024)} Ko en base 64`);
for (const c of [0x20, 0xa0, 0x202f, 0x2009, 0x2d, 0x2010, 0x2019, 0xab, 0xbb, 0x153, 0x152, 0xe9, 0xc9, 0x2013, 0x2014]) console.log(c.toString(16), map.has(c) ? advance(map.get(c)) : `absent`);
