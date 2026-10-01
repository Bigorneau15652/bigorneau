// Export de haute qualite, etage 3 : lecture d'une police OpenType (contours CFF) et mise en forme du texte.
// Lit les tables head, hhea, hmtx, maxp, cmap, OS/2, GSUB (ligatures) et GPOS (crenage des paires), et fournit les glyphes d'un
// texte avec leurs avances, ligatures formees et crenage applique. Le contenu du fichier CFF est repris tel quel pour
// l'incorporer au PDF. Ce module ne depend ni d'Obsidian ni du navigateur.

export interface ShapedGlyph {
  gid: number;
  // Avance du glyphe en unites de la police, crenage avec le glyphe suivant compris.
  advance: number;
  // Caracteres que le glyphe represente (plusieurs pour une ligature), pour que le texte du PDF reste copiable.
  text: string;
}

interface Coverage {
  has(gid: number): number;
}

interface PairLookup {
  subtables: PairSubtable[];
}

interface PairSubtable {
  coverage: Coverage;
  // Valeur d'avance a ajouter au premier glyphe de la paire, ou null si la paire n'est pas dans ce sous-tableau.
  adjust(first: number, second: number): number | null;
}

interface LigatureRule {
  // Glyphes qui suivent le premier, et glyphe de la ligature.
  components: number[];
  ligature: number;
}

export class OpenTypeFont {
  readonly unitsPerEm: number;
  readonly ascender: number;
  readonly descender: number;
  readonly lineGap: number;
  // Boite englobante, angle d'italique et hauteur des capitales, pour le descripteur de police du PDF.
  readonly bbox: [number, number, number, number];
  readonly italicAngle: number;
  capHeight: number;
  readonly numGlyphs: number;
  // Contenu du fichier CFF (contours), a incorporer au PDF.
  readonly cff: Uint8Array;
  readonly cmap = new Map<number, number>();
  private advances: number[] = [];
  private ligatures = new Map<number, LigatureRule[]>();
  private kernLookups: PairLookup[] = [];
  private view: DataView;
  private cache = new Map<string, ShapedGlyph[]>();

  constructor(readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const tag = String.fromCharCode(...data.subarray(0, 4));
    if (tag !== `OTTO`) throw new Error(`police OpenType a contours CFF attendue`);
    const tables = this.readDirectory();
    const t = (name: string): number => {
      const off = tables.get(name);
      if (off === undefined) throw new Error(`table ${name} absente`);
      return off.offset;
    };
    const head = t(`head`);
    this.unitsPerEm = this.view.getUint16(head + 18);
    this.bbox = [this.view.getInt16(head + 36), this.view.getInt16(head + 38), this.view.getInt16(head + 40), this.view.getInt16(head + 42)];
    const post = tables.get(`post`);
    this.italicAngle = post ? this.view.getInt32(post.offset + 4) / 65536 : 0;
    const os2 = tables.get(`OS/2`);
    this.capHeight = os2 && os2.length >= 90 && this.view.getUint16(os2.offset) >= 2 ? this.view.getInt16(os2.offset + 88) : 0;
    const hhea = t(`hhea`);
    this.ascender = this.view.getInt16(hhea + 4);
    this.descender = this.view.getInt16(hhea + 6);
    this.lineGap = this.view.getInt16(hhea + 8);
    const numHMetrics = this.view.getUint16(hhea + 34);
    this.numGlyphs = this.view.getUint16(t(`maxp`) + 4);
    if (this.capHeight === 0) this.capHeight = this.ascender;
    const hmtx = t(`hmtx`);
    let last = 0;
    for (let g = 0; g < this.numGlyphs; g++) {
      if (g < numHMetrics) last = this.view.getUint16(hmtx + 4 * g);
      this.advances.push(last);
    }
    this.readCmap(t(`cmap`));
    const cff = tables.get(`CFF `);
    if (!cff) throw new Error(`table CFF absente`);
    this.cff = data.subarray(cff.offset, cff.offset + cff.length);
    const gsub = tables.get(`GSUB`);
    if (gsub) this.readGsub(gsub.offset);
    const gpos = tables.get(`GPOS`);
    if (gpos) this.readGpos(gpos.offset);
  }

  private readDirectory(): Map<string, { offset: number; length: number }> {
    const n = this.view.getUint16(4);
    const out = new Map<string, { offset: number; length: number }>();
    for (let i = 0; i < n; i++) {
      const o = 12 + 16 * i;
      const name = String.fromCharCode(...this.data.subarray(o, o + 4));
      out.set(name, { offset: this.view.getUint32(o + 8), length: this.view.getUint32(o + 12) });
    }
    return out;
  }

  // ------------------------------------------------------------------ cmap

  private readCmap(base: number): void {
    const v = this.view;
    const n = v.getUint16(base + 2);
    // On prefere un sous-tableau de format 12 (tout Unicode), sinon de format 4 (plan multilingue de base).
    let best = -1;
    let bestFormat = 0;
    for (let i = 0; i < n; i++) {
      const platform = v.getUint16(base + 4 + 8 * i);
      const encoding = v.getUint16(base + 6 + 8 * i);
      const off = base + v.getUint32(base + 8 + 8 * i);
      const format = v.getUint16(off);
      const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
      if (unicode && (format === 12 || format === 4) && format > bestFormat) {
        best = off;
        bestFormat = format;
      }
    }
    if (best < 0) throw new Error(`table cmap sans correspondance Unicode`);
    if (bestFormat === 12) {
      const groups = v.getUint32(best + 12);
      for (let g = 0; g < groups; g++) {
        const o = best + 16 + 12 * g;
        const start = v.getUint32(o);
        const end = v.getUint32(o + 4);
        const gid = v.getUint32(o + 8);
        for (let c = start; c <= end; c++) this.cmap.set(c, gid + (c - start));
      }
      return;
    }
    const segX2 = v.getUint16(best + 6);
    const endO = best + 14;
    const startO = endO + segX2 + 2;
    const deltaO = startO + segX2;
    const rangeO = deltaO + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = v.getUint16(endO + 2 * s);
      const start = v.getUint16(startO + 2 * s);
      const delta = v.getInt16(deltaO + 2 * s);
      const ro = v.getUint16(rangeO + 2 * s);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let gid: number;
        if (ro === 0) gid = (c + delta) & 0xffff;
        else {
          const g = v.getUint16(rangeO + 2 * s + ro + 2 * (c - start));
          gid = g === 0 ? 0 : (g + delta) & 0xffff;
        }
        if (gid !== 0) this.cmap.set(c, gid);
      }
    }
  }

  // ------------------------------------------------------------------ structures communes de GSUB et GPOS

  private coverage(off: number): Coverage {
    const v = this.view;
    const format = v.getUint16(off);
    const count = v.getUint16(off + 2);
    const index = new Map<number, number>();
    if (format === 1) {
      for (let i = 0; i < count; i++) index.set(v.getUint16(off + 4 + 2 * i), i);
    } else {
      for (let i = 0; i < count; i++) {
        const o = off + 4 + 6 * i;
        const start = v.getUint16(o);
        const end = v.getUint16(o + 2);
        const first = v.getUint16(o + 4);
        for (let g = start; g <= end; g++) index.set(g, first + (g - start));
      }
    }
    return { has: (gid) => index.get(gid) ?? -1 };
  }

  private classDef(off: number): (gid: number) => number {
    const v = this.view;
    const format = v.getUint16(off);
    const map = new Map<number, number>();
    if (format === 1) {
      const start = v.getUint16(off + 2);
      const count = v.getUint16(off + 4);
      for (let i = 0; i < count; i++) map.set(start + i, v.getUint16(off + 6 + 2 * i));
    } else {
      const count = v.getUint16(off + 2);
      for (let i = 0; i < count; i++) {
        const o = off + 4 + 6 * i;
        const start = v.getUint16(o);
        const end = v.getUint16(o + 2);
        const cls = v.getUint16(o + 4);
        for (let g = start; g <= end; g++) map.set(g, cls);
      }
    }
    return (gid) => map.get(gid) ?? 0;
  }

  // Indices des recherches (lookups) referencees par les proprietes dont l'etiquette est dans `tags`, dans l'ordre croissant.
  private lookupIndices(table: number, tags: string[]): number[] {
    const v = this.view;
    const featureList = table + v.getUint16(table + 6);
    const count = v.getUint16(featureList);
    const out = new Set<number>();
    for (let i = 0; i < count; i++) {
      const rec = featureList + 2 + 6 * i;
      const tag = String.fromCharCode(...this.data.subarray(rec, rec + 4));
      if (!tags.includes(tag)) continue;
      const feature = featureList + v.getUint16(rec + 4);
      const n = v.getUint16(feature + 2);
      for (let k = 0; k < n; k++) out.add(v.getUint16(feature + 4 + 2 * k));
    }
    return [...out].sort((a, b) => a - b);
  }

  // Sous-tableaux d'une recherche, avec le type effectif (les recherches d'extension renvoient au type reel).
  private lookupSubtables(table: number, index: number): { type: number; offsets: number[] } {
    const v = this.view;
    const lookupList = table + v.getUint16(table + 8);
    const lookup = lookupList + v.getUint16(lookupList + 2 + 2 * index);
    let type = v.getUint16(lookup);
    const count = v.getUint16(lookup + 4);
    const offsets: number[] = [];
    for (let i = 0; i < count; i++) offsets.push(lookup + v.getUint16(lookup + 6 + 2 * i));
    const extension = type === 7 || type === 9;
    if (extension) {
      const real = offsets.map((o) => o + v.getUint32(o + 4));
      type = offsets.length > 0 ? v.getUint16(offsets[0] + 2) : type;
      return { type, offsets: real };
    }
    return { type, offsets };
  }

  // ------------------------------------------------------------------ GSUB : ligatures

  private readGsub(table: number): void {
    const v = this.view;
    for (const index of this.lookupIndices(table, [`liga`, `clig`])) {
      const { type, offsets } = this.lookupSubtables(table, index);
      if (type !== 4) continue;
      for (const sub of offsets) {
        const cov = this.coverage(sub + v.getUint16(sub + 2));
        const setCount = v.getUint16(sub + 4);
        // Les glyphes de depart de ce sous-tableau, dans l'ordre de leur indice de couverture.
        const firsts: number[] = [];
        for (let gid = 0; gid < this.numGlyphs; gid++) {
          const idx = cov.has(gid);
          if (idx >= 0 && idx < setCount) firsts[idx] = gid;
        }
        for (let s = 0; s < setCount; s++) {
          const first = firsts[s];
          if (first === undefined) continue;
          const set = sub + v.getUint16(sub + 6 + 2 * s);
          const n = v.getUint16(set);
          const rules = this.ligatures.get(first) ?? [];
          for (let r = 0; r < n; r++) {
            const lig = set + v.getUint16(set + 2 + 2 * r);
            const ligature = v.getUint16(lig);
            const comps = v.getUint16(lig + 2);
            const components: number[] = [];
            for (let c = 0; c < comps - 1; c++) components.push(v.getUint16(lig + 4 + 2 * c));
            rules.push({ components, ligature });
          }
          this.ligatures.set(first, rules);
        }
      }
    }
  }

  // ------------------------------------------------------------------ GPOS : crenage

  private valueSize(format: number): number {
    let n = 0;
    for (let b = 0; b < 8; b++) if (format & (1 << b)) n += 2;
    return n;
  }

  // Avance horizontale d'un enregistrement de valeur (0 s'il n'en contient pas).
  private xAdvance(off: number, format: number): number {
    if (!(format & 0x0004)) return 0;
    let o = off;
    if (format & 0x0001) o += 2;
    if (format & 0x0002) o += 2;
    return this.view.getInt16(o);
  }

  private readGpos(table: number): void {
    const v = this.view;
    for (const index of this.lookupIndices(table, [`kern`])) {
      const { type, offsets } = this.lookupSubtables(table, index);
      if (type !== 2) continue;
      const lookup: PairLookup = { subtables: [] };
      for (const sub of offsets) {
        const format = v.getUint16(sub);
        const coverage = this.coverage(sub + v.getUint16(sub + 2));
        const f1 = v.getUint16(sub + 4);
        const f2 = v.getUint16(sub + 6);
        const size1 = this.valueSize(f1);
        const size2 = this.valueSize(f2);
        if (format === 1) {
          const setCount = v.getUint16(sub + 8);
          const sets: Map<number, number>[] = [];
          for (let s = 0; s < setCount; s++) {
            const set = sub + v.getUint16(sub + 10 + 2 * s);
            const n = v.getUint16(set);
            const m = new Map<number, number>();
            for (let i = 0; i < n; i++) {
              const rec = set + 2 + i * (2 + size1 + size2);
              m.set(v.getUint16(rec), this.xAdvance(rec + 2, f1));
            }
            sets.push(m);
          }
          lookup.subtables.push({
            coverage,
            adjust: (first, second) => {
              const idx = coverage.has(first);
              return idx < 0 ? null : sets[idx]?.get(second) ?? null;
            },
          });
        } else if (format === 2) {
          const class1 = this.classDef(sub + v.getUint16(sub + 8));
          const class2 = this.classDef(sub + v.getUint16(sub + 10));
          const n1 = v.getUint16(sub + 12);
          const n2 = v.getUint16(sub + 14);
          const recSize = size1 + size2;
          const base = sub + 16;
          lookup.subtables.push({
            coverage,
            adjust: (first, second) => {
              if (coverage.has(first) < 0) return null;
              const c1 = class1(first);
              const c2 = class2(second);
              if (c1 >= n1 || c2 >= n2) return null;
              return this.xAdvance(base + (c1 * n2 + c2) * recSize, f1);
            },
          });
        }
      }
      this.kernLookups.push(lookup);
    }
  }

  // ------------------------------------------------------------------ mise en forme

  hasChar(cp: number): boolean {
    return this.cmap.has(cp);
  }

  advance(gid: number): number {
    return this.advances[gid] ?? 0;
  }

  // Glyphes d'un texte : ligatures formees, puis crenage entre glyphes voisins. Les caracteres absents de la police
  // prennent le glyphe `fallback` (point d'interrogation) ; l'appelant les signale.
  shape(text: string, fallback = 0x3f): ShapedGlyph[] {
    const cached = this.cache.get(text);
    if (cached) return cached;
    let glyphs: { gid: number; text: string }[] = [];
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      const gid = this.cmap.get(cp) ?? this.cmap.get(fallback) ?? 0;
      glyphs.push({ gid, text: ch });
    }
    if (this.ligatures.size > 0) {
      const out: { gid: number; text: string }[] = [];
      for (let i = 0; i < glyphs.length; i++) {
        const rules = this.ligatures.get(glyphs[i].gid);
        let done = false;
        if (rules) {
          for (const rule of rules) {
            const n = rule.components.length;
            let match = true;
            for (let k = 0; k < n; k++) {
              if (glyphs[i + 1 + k]?.gid !== rule.components[k]) {
                match = false;
                break;
              }
            }
            if (!match) continue;
            out.push({ gid: rule.ligature, text: glyphs.slice(i, i + 1 + n).map((g) => g.text).join(``) });
            i += n;
            done = true;
            break;
          }
        }
        if (!done) out.push(glyphs[i]);
      }
      glyphs = out;
    }
    const shaped: ShapedGlyph[] = glyphs.map((g, i) => {
      let advance = this.advance(g.gid);
      const next = glyphs[i + 1];
      if (next) advance += this.kerning(g.gid, next.gid);
      return { gid: g.gid, advance, text: g.text };
    });
    this.cache.set(text, shaped);
    return shaped;
  }

  private kerning(first: number, second: number): number {
    let total = 0;
    for (const lookup of this.kernLookups) {
      for (const sub of lookup.subtables) {
        const adj = sub.adjust(first, second);
        if (adj !== null) {
          total += adj;
          break;
        }
      }
    }
    return total;
  }

  // Largeur d'un texte en unites de la police.
  width(text: string): number {
    let w = 0;
    for (const g of this.shape(text)) w += g.advance;
    return w;
  }
}
