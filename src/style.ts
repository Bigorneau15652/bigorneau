// Style des cases : style de toute la carte, style par niveau de titre et style d'une case.
// Les styles par niveau et par case sont stockes dans des commentaires Obsidian invisibles de la note :
//   %% mmw {"style":{"strokeColor":"#e03131"},"levels":{"2":{"fillColor":"#a5d8ff"}}} %%
// Le meme commentaire porte les etiquettes, le titre court et le commentaire d'une case (visibles sur la carte seulement) :
//   %% mmw {"tags":["k3f9"],"short":"Budget","comment":"A revoir en mars"} %%
// (sans dependance a Obsidian pour pouvoir etre teste hors de l'application).
import type { Corners, FontFamily, Roughness, StrokeDash, TextAlign } from "./settings";

export interface NodeStyle {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  strokeDash: StrokeDash;
  roughness: Roughness;
  corners: Corners;
  showFrames: boolean;
  fontFamily: FontFamily;
  fontScale: number;
  textAlign: TextAlign;
}

export type StylePatch = Partial<NodeStyle>;

export interface MmMeta {
  // Style de la case elle-meme.
  style?: StylePatch;
  // Style par niveau de titre (cle : niveau, 0 pour le noeud racine). Porte par le noeud racine.
  levels?: Record<string, StylePatch>;
  // Etiquettes attribuees (identifiants de la liste des etiquettes des reglages), titre court affiche sur la carte
  // a la place du titre, et commentaire libre.
  tags?: string[];
  short?: string;
  comment?: string;
}

export const TAG_ID = /^[A-Za-z0-9_-]{1,24}$/;
export const MAX_TAGS_PER_NODE = 30;
export const MAX_SHORT = 80;
export const MAX_COMMENT = 2000;

export const STYLE_KEYS: (keyof NodeStyle)[] = [
  `strokeColor`,
  `fillColor`,
  `strokeWidth`,
  `strokeDash`,
  `roughness`,
  `corners`,
  `showFrames`,
  `fontFamily`,
  `fontScale`,
  `textAlign`,
];

export function globalStyle(s: NodeStyle): NodeStyle {
  const out: Record<string, unknown> = {};
  for (const k of STYLE_KEYS) out[k] = s[k];
  return out as unknown as NodeStyle;
}

// Style effectif d'une case : reglages de la carte, puis style de son niveau, puis style de la case.
export function resolveStyle(base: NodeStyle, levels: Record<string, StylePatch> | undefined, level: number, own: StylePatch | undefined): NodeStyle {
  return { ...base, ...(levels?.[String(level)] ?? {}), ...(own ?? {}) };
}

export function mergePatch(a: StylePatch | undefined, b: StylePatch): StylePatch {
  return { ...(a ?? {}), ...b };
}

export function omitKeys(patch: StylePatch | undefined, keys: string[]): StylePatch {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch ?? {})) if (!keys.includes(k)) out[k] = v;
  return out as StylePatch;
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const inList = <T extends string | number>(v: unknown, list: readonly T[]): v is T => list.includes(v as T);
const inRange = (v: unknown, min: number, max: number): v is number => typeof v === `number` && Number.isFinite(v) && v >= min && v <= max;

// Ne garde que des valeurs valides : la note peut avoir ete modifiee a la main.
export function sanitizePatch(raw: unknown): StylePatch {
  const out: StylePatch = {};
  if (!raw || typeof raw !== `object`) return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.strokeColor === `string` && (r.strokeColor === `` || HEX.test(r.strokeColor))) out.strokeColor = r.strokeColor;
  if (typeof r.fillColor === `string` && (r.fillColor === `` || HEX.test(r.fillColor))) out.fillColor = r.fillColor;
  if (inRange(r.strokeWidth, 0.5, 8)) out.strokeWidth = r.strokeWidth;
  if (inList(r.strokeDash, [`solid`, `dashed`, `dotted`] as const)) out.strokeDash = r.strokeDash;
  if (inList(r.roughness, [0, 1, 2] as const)) out.roughness = r.roughness;
  if (inList(r.corners, [`sharp`, `round`] as const)) out.corners = r.corners;
  if (typeof r.showFrames === `boolean`) out.showFrames = r.showFrames;
  if (inList(r.fontFamily, [`default`, `handwritten`, `mono`] as const)) out.fontFamily = r.fontFamily;
  if (inRange(r.fontScale, 0.5, 2)) out.fontScale = r.fontScale;
  if (inList(r.textAlign, [`left`, `center`, `right`] as const)) out.textAlign = r.textAlign;
  return out;
}

export function isEmptyPatch(p: StylePatch | undefined): boolean {
  return !p || Object.keys(p).length === 0;
}

export function sanitizeMeta(raw: unknown): MmMeta {
  const out: MmMeta = {};
  if (!raw || typeof raw !== `object`) return out;
  const r = raw as Record<string, unknown>;
  const style = sanitizePatch(r.style);
  if (!isEmptyPatch(style)) out.style = style;
  if (r.levels && typeof r.levels === `object`) {
    const levels: Record<string, StylePatch> = {};
    for (const [k, v] of Object.entries(r.levels as Record<string, unknown>)) {
      if (!/^[0-6]$/.test(k)) continue;
      const p = sanitizePatch(v);
      if (!isEmptyPatch(p)) levels[k] = p;
    }
    if (Object.keys(levels).length > 0) out.levels = levels;
  }
  if (Array.isArray(r.tags)) {
    const tags = [...new Set(r.tags.filter((t): t is string => typeof t === `string` && TAG_ID.test(t)))].slice(0, MAX_TAGS_PER_NODE);
    if (tags.length > 0) out.tags = tags;
  }
  if (typeof r.short === `string`) {
    const short = r.short.replace(/[\r\n]+/g, ` `).trim().slice(0, MAX_SHORT);
    if (short !== ``) out.short = short;
  }
  if (typeof r.comment === `string`) {
    const comment = r.comment.replace(/\r\n?/g, `\n`).trim().slice(0, MAX_COMMENT);
    if (comment !== ``) out.comment = comment;
  }
  return out;
}

export function isEmptyMeta(m: MmMeta | undefined): boolean {
  return (
    !m ||
    (isEmptyPatch(m.style) && (!m.levels || Object.keys(m.levels).length === 0) && (!m.tags || m.tags.length === 0) && !m.short && !m.comment)
  );
}

// Meta sans les styles : ce qui reste quand on retire toute l'apparence (etiquettes, titre court, commentaire).
export function detailsOnly(m: MmMeta | undefined): MmMeta | null {
  if (!m) return null;
  const out: MmMeta = {};
  if (m.tags && m.tags.length > 0) out.tags = m.tags;
  if (m.short) out.short = m.short;
  if (m.comment) out.comment = m.comment;
  return isEmptyMeta(out) ? null : out;
}

const META_RE = /^%%\s*mmw\s+(\{.*\})\s*%%\s*$/;

// Lit une ligne de commentaire de style. Renvoie null si la ligne n'en est pas un.
export function parseMetaLine(line: string): MmMeta | null {
  const m = META_RE.exec(line.replace(/(\r\n|\n|\r)$/, ``));
  if (!m) return null;
  try {
    return sanitizeMeta(JSON.parse(m[1]));
  } catch {
    return {};
  }
}

// Ecrit le commentaire sur une seule ligne. Le signe pour cent est ecrit \\u0025 : deux d'entre eux de suite (dans un
// commentaire par exemple) fermeraient le commentaire Obsidian.
export function formatMetaLine(meta: MmMeta): string {
  const ordered: MmMeta = {};
  if (meta.style) ordered.style = meta.style;
  if (meta.levels) ordered.levels = meta.levels;
  if (meta.tags) ordered.tags = meta.tags;
  if (meta.short) ordered.short = meta.short;
  if (meta.comment) ordered.comment = meta.comment;
  return `%% mmw ${JSON.stringify(ordered).replace(/%/g, `\\u0025`)} %%`;
}

// Libelle de la portee d'une modification de style, pour le panneau d'apparence.
export function describeScope(levels: number[], count: number, allSelected: boolean, individual: boolean): string {
  if (count === 0 || (allSelected && !individual)) return `toute la carte`;
  if (individual) return count === 1 ? `cette case seulement` : `les ${count} cases sélectionnées`;
  const names = [...new Set(levels)].sort((a, b) => a - b);
  const label = (n: number): string => (n === 0 ? `principal` : String(n));
  if (names.length === 1) return names[0] === 0 ? `le titre principal` : `tous les titres de niveau ${names[0]}`;
  const list = names.map(label);
  return `tous les titres de niveaux ${list.slice(0, -1).join(`, `)} et ${list[list.length - 1]}`;
}
