// Export de haute qualite, etage 3 : lecture d'une police OpenType (contours CFF ou TrueType) et mise en forme du texte.
// Lit les tables head, hhea, hmtx, maxp, cmap, name, OS/2, GSUB (ligatures), GPOS (crenage des paires) et, a defaut, kern, et fournit
// les glyphes d'un texte avec leurs avances, ligatures formees et crenage applique. Le contenu de la table CFF (police OpenType a
// contours CFF) ou le fichier entier (police TrueType) est repris tel quel pour l'incorporer au PDF. Ce module ne depend ni d'Obsidian
// ni du navigateur.

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
  // Contours CFF (police OpenType) ou TrueType (glyf) : ce qui change l'objet de police du PDF.
  readonly flavor: `cff` | `truetype`;
  // Ce qu'il faut incorporer au PDF : la table CFF (police a contours CFF) ou le fichier entier (police TrueType).
  readonly cff: Uint8Array;
  // Noms lus dans la table name : famille et sous-famille (Regular, Bold Italic...), et nom PostScript.
  family = ``;
  subfamily = ``;
  postScriptName = ``;
  // Gras et italique d'apres la police elle-meme (OS/2 et head).
  isBold = false;
  isItalic = false;
  // Droits d'incorporation (OS/2 fsType) : vrai quand le fichier interdit de l'incorporer dans un document.
  embeddingRestricted = false;
  // Police variable : seule l'instance par defaut est utilisee.
  isVariable = false;
  // Crenage de l'ancienne table kern (paires de glyphes), utilise quand GPOS n'en donne pas.
  private kernPairs = new Map<number, number>();
  private cmapTable = new Map<number, number>();
  private advances: number[] = [];
  private ligatures = new Map<number, LigatureRule[]>();
  private kernLookups: PairLookup[] = [];
  private view: DataView;
  private cache = new Map<string, ShapedGlyph[]>();
  // Tables lues seulement quand la police sert a composer du texte (voir ensureShaping) : le dossier des polices est analyse a chaque
  // demarrage d'Obsidian, et lire le crenage et les ligatures de toutes les polices a ce moment-la ralentit le chargement.
  private tables = new Map<string, { offset: number; length: number }>();
  private shapingReady = false;
  private numHMetrics = 0;

  constructor(readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const tag = String.fromCharCode(...data.subarray(0, 4));
    if (tag === `ttcf`) throw new Error(`collection de polices (.ttc) non prise en charge`);
    const isCff = tag === `OTTO`;
    const isTrueType = tag === `\u0000\u0001\u0000\u0000` || tag === `true`;
    if (!isCff && !isTrueType) throw new Error(`police OpenType ou TrueType attendue (WOFF et WOFF2 ne sont pas pris en charge)`);
    this.flavor = isCff ? `cff` : `truetype`;
    const tables = this.readDirectory();
    this.tables = tables;
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
    this.numHMetrics = this.view.getUint16(hhea + 34);
    this.numGlyphs = this.view.getUint16(t(`maxp`) + 4);
    if (this.capHeight === 0) this.capHeight = this.ascender;
    // Les tables obligatoires doivent etre la : une police qui n'en a pas est refusee des l'ouverture du fichier.
    t(`hmtx`);
    t(`cmap`);
    if (isCff) {
      const cff = tables.get(`CFF `);
      if (!cff) throw new Error(`table CFF absente (police OpenType a contours CFF2 non prise en charge)`);
      this.cff = data.subarray(cff.offset, cff.offset + cff.length);
    } else {
      if (!tables.has(`glyf`) || !tables.has(`loca`)) throw new Error(`tables glyf et loca absentes`);
      this.cff = data;
    }
    this.isVariable = tables.has(`fvar`);
    this.readNames(tables.get(`name`));
    const os2tab = tables.get(`OS/2`);
    if (os2tab && os2tab.length >= 64) {
      const fsType = this.view.getUint16(os2tab.offset + 8);
      // Bit 1 : licence restreinte, incorporation interdite.
      this.embeddingRestricted = (fsType & 0x0002) !== 0 && (fsType & 0x000c) === 0;
      const selection = this.view.getUint16(os2tab.offset + 62);
      this.isItalic = (selection & 0x0001) !== 0;
      this.isBold = (selection & 0x0020) !== 0;
    }
    const macStyle = this.view.getUint16(head + 44);
    if (macStyle & 1) this.isBold = true;
    if (macStyle & 2) this.isItalic = true;
  }

  // Lit la table des caracteres, les largeurs, les ligatures et le crenage, une seule fois, au premier besoin. Une table de
  // ligatures ou de crenage abimee n'empeche pas d'utiliser la police : ces reglages typographiques sont alors ignores.
  private ensureShaping(): void {
    if (this.shapingReady) return;
    this.shapingReady = true;
    const tables = this.tables;
    try {
      const hmtx = tables.get(`hmtx`)!.offset;
      let last = 0;
      for (let g = 0; g < this.numGlyphs; g++) {
        if (g < this.numHMetrics) last = this.view.getUint16(hmtx + 4 * g);
        this.advances.push(last);
      }
      this.readCmap(tables.get(`cmap`)!.offset);
    } catch {
      // Table des caracteres illisible : la police n'a alors aucun caractere.
    }
    try {
      const gsub = tables.get(`GSUB`);
      if (gsub) this.readGsub(gsub.offset);
    } catch {
      this.ligatures.clear();
    }
    try {
      const gpos = tables.get(`GPOS`);
      if (gpos) this.readGpos(gpos.offset);
    } catch {
      this.kernLookups = [];
    }
    try {
      if (this.kernLookups.length === 0) {
        const kern = tables.get(`kern`);
        if (kern) this.readKern(kern.offset, kern.length);
      }
    } catch {
      this.kernPairs.clear();
    }
  }

  get cmap(): Map<number, number> {
    this.ensureShaping();
    return this.cmapTable;
  }

  // Noms de la police (table name) : famille typographique (ID 16) sinon famille (ID 1), sous-famille (17 ou 2), nom PostScript (6).
  private readNames(table: { offset: number; length: number } | undefined): void {
    if (!table) return;
    const v = this.view;
    const base = table.offset;
    const count = v.getUint16(base + 2);
    const strings = base + v.getUint16(base + 4);
    const found = new Map<number, { text: string; rank: number }>();
    for (let i = 0; i < count; i++) {
      const o = base + 6 + 12 * i;
      const platform = v.getUint16(o);
      const encoding = v.getUint16(o + 2);
      const language = v.getUint16(o + 4);
      const id = v.getUint16(o + 6);
      const length = v.getUint16(o + 8);
      const offset = v.getUint16(o + 10);
      const at = strings + offset;
      if (at + length > this.data.length) continue;
      let text = ``;
      let rank = 0;
      if (platform === 3 || platform === 0) {
        // UTF-16 en grand-boutiste ; l'anglais americain (0x409) est prefere.
        for (let k = 0; k + 1 < length; k += 2) text += String.fromCharCode(v.getUint16(at + k));
        rank = platform === 3 && language === 0x409 ? 3 : 2;
      } else if (platform === 1 && encoding === 0) {
        for (let k = 0; k < length; k++) text += String.fromCharCode(this.data[at + k]);
        rank = 1;
      } else continue;
      const old = found.get(id);
      if (!old || rank > old.rank) found.set(id, { text, rank });
    }
    this.family = found.get(16)?.text ?? found.get(1)?.text ?? ``;
    this.subfamily = found.get(17)?.text ?? found.get(2)?.text ?? ``;
    this.postScriptName = found.get(6)?.text ?? ``;
  }

  // Table kern, format 0 : une liste de paires de glyphes avec leur ajustement horizontal.
  private readKern(base: number, length: number): void {
    const v = this.view;
    if (length < 4 || v.getUint16(base) !== 0) return;
    const tables = v.getUint16(base + 2);
    let off = base + 4;
    for (let t = 0; t < tables && off + 14 <= base + length; t++) {
      const size = v.getUint16(off + 2);
      const coverage = v.getUint16(off + 4);
      // Horizontal (bit 0), sans valeurs minimales ni remplacement, format 0.
      if ((coverage & 1) !== 0 && coverage >> 8 === 0) {
        const pairs = v.getUint16(off + 6);
        for (let i = 0; i < pairs; i++) {
          const o = off + 14 + 6 * i;
          if (o + 6 > base + length) break;
          this.kernPairs.set(v.getUint16(o) * 65536 + v.getUint16(o + 2), v.getInt16(o + 4));
        }
      }
      if (size === 0) break;
      off += size;
    }
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
        for (let c = start; c <= end; c++) this.cmapTable.set(c, gid + (c - start));
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
        if (gid !== 0) this.cmapTable.set(c, gid);
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
    this.ensureShaping();
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
    if (this.kernPairs.size > 0) return this.kernPairs.get(first * 65536 + second) ?? 0;
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
