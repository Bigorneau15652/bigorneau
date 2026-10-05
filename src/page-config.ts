// Reglages des pages d'une note : en-tete, pied de page, numerotation. Ils sont ecrits dans la note, sur une ligne de commentaire
// Obsidian placee sous les proprietes : %% mmw-page {...} %%, invisible en lecture et masquee dans l'apercu en direct. Chaque zone de
// l'en-tete et du pied de page est un texte avec un balisage minimal : **gras**, *italique*, {xs} {s} {m} {l} pour la taille,
// {document} {chapter} {section} {author} {date} {page} {pages} pour les valeurs variables, ![[image.png|hauteur]] pour une image.
// Ce module ne depend pas d'Obsidian : il sert a l'export et aux fenetres de reglage.

export type SizeCode = `xs` | `s` | `m` | `l`;
export const SIZE_POINTS: Record<SizeCode, number> = { xs: 7, s: 8.5, m: 10, l: 12 };
export const SIZE_CODES: SizeCode[] = [`xs`, `s`, `m`, `l`];

export interface Zones {
  left: string;
  center: string;
  right: string;
}

export interface Band {
  enabled: boolean;
  // Zones des pages de droite (recto), ou de toutes les pages.
  zones: Zones;
  // Pages de gauche differentes de celles de droite : `verso` donne les zones des pages de gauche.
  mirror: boolean;
  verso: Zones;
  // Filet fin entre le texte et la bande.
  rule: boolean;
}

export type NumberPlace = `header` | `footer` | `outer`;
export type NumberAlign = `outer` | `inner` | `center`;
export type NumberShape = `none` | `circle` | `square` | `rounded`;

export interface Numbering {
  enabled: boolean;
  place: NumberPlace;
  align: NumberAlign;
  shape: NumberShape;
  // Couleurs de la forme et du chiffre (#rrggbb).
  fill: string;
  stroke: string;
  color: string;
  size: SizeCode;
}

export interface PageConfig {
  header: Band;
  footer: Band;
  numbering: Numbering;
  // Pas d'en-tete, de pied de page ni de numero sur la premiere page (page de garde).
  skipFirst: boolean;
}

export const VARIABLES = [`document`, `chapter`, `section`, `author`, `date`, `page`, `pages`] as const;
export type Variable = (typeof VARIABLES)[number];

const emptyZones = (): Zones => ({ left: ``, center: ``, right: `` });

export function defaultBand(): Band {
  return { enabled: false, zones: emptyZones(), mirror: false, verso: emptyZones(), rule: false };
}

export function defaultConfig(): PageConfig {
  return {
    header: defaultBand(),
    footer: defaultBand(),
    numbering: { enabled: false, place: `footer`, align: `center`, shape: `none`, fill: `#e9ecef`, stroke: `#495057`, color: `#212529`, size: `m` },
    skipFirst: false,
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === `object` && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === `string` ? v : ``);
const flag = (v: unknown, fallback: boolean): boolean => (typeof v === `boolean` ? v : fallback);
const pick = <T extends string>(v: unknown, allowed: T[], fallback: T): T => (typeof v === `string` && (allowed as string[]).includes(v) ? (v as T) : fallback);
const color = (v: unknown, fallback: string): string => (typeof v === `string` && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback);

function zonesOf(v: unknown): Zones {
  const r = isObject(v) ? v : {};
  return { left: text(r.left), center: text(r.center), right: text(r.right) };
}

function bandOf(v: unknown): Band {
  const r = isObject(v) ? v : {};
  return { enabled: flag(r.enabled, false), zones: zonesOf(r.zones), mirror: flag(r.mirror, false), verso: zonesOf(r.verso), rule: flag(r.rule, false) };
}

// Reglages lus dans un objet JSON quelconque : tout ce qui est invalide est remplace par la valeur par defaut.
export function sanitizeConfig(raw: unknown): PageConfig {
  const d = defaultConfig();
  const r = isObject(raw) ? raw : {};
  const n = isObject(r.numbering) ? r.numbering : {};
  return {
    header: bandOf(r.header),
    footer: bandOf(r.footer),
    numbering: {
      enabled: flag(n.enabled, d.numbering.enabled),
      place: pick(n.place, [`header`, `footer`, `outer`], d.numbering.place),
      align: pick(n.align, [`outer`, `inner`, `center`], d.numbering.align),
      shape: pick(n.shape, [`none`, `circle`, `square`, `rounded`], d.numbering.shape),
      fill: color(n.fill, d.numbering.fill),
      stroke: color(n.stroke, d.numbering.stroke),
      color: color(n.color, d.numbering.color),
      size: pick(n.size, SIZE_CODES, d.numbering.size),
    },
    skipFirst: flag(r.skipFirst, false),
  };
}

export const sameConfig = (a: PageConfig, b: PageConfig): boolean => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- ligne de commentaire dans la note

const MARKER_RE = /^%%[ \t]*mmw-page[ \t]+(\{.*\})[ \t]*%%[ \t]*$/;

// Ecrit les reglages sur une seule ligne. Le signe pour cent est ecrit % : deux d'entre eux de suite fermeraient le commentaire.
export function formatPageMarker(config: PageConfig): string {
  return `%% mmw-page ${JSON.stringify(config).replace(/%/g, `\\u0025`)} %%`;
}

export function parsePageMarker(line: string): PageConfig | null {
  const m = MARKER_RE.exec(line.replace(/(\r\n|\n|\r)$/, ``).trim());
  if (!m) return null;
  try {
    return sanitizeConfig(JSON.parse(m[1]));
  } catch {
    return defaultConfig();
  }
}

export interface FoundConfig {
  config: PageConfig;
  // Decalages de la ligne du commentaire (sans son retour a la ligne).
  from: number;
  to: number;
}

// Reglages de la note (premiere ligne de repere), ou null s'il n'y en a pas.
export function findPageConfig(noteText: string): FoundConfig | null {
  if (!noteText.includes(`mmw-page`)) return null;
  let pos = 0;
  for (const line of noteText.split(`\n`)) {
    const trimmed = line.endsWith(`\r`) ? line.slice(0, -1) : line;
    if (trimmed.includes(`mmw-page`)) {
      const config = parsePageMarker(trimmed);
      if (config) return { config, from: pos, to: pos + trimmed.length };
    }
    pos += line.length + 1;
  }
  return null;
}

// Fin des proprietes (le bloc --- ... --- au debut de la note) : decalage du debut de la ligne qui les suit, ou 0.
function afterProperties(noteText: string): number {
  if (!/^---[ \t]*\r?\n/.test(noteText)) return 0;
  const re = /\r?\n---[ \t]*(\r?\n|$)/g;
  re.lastIndex = 3;
  const m = re.exec(noteText);
  return m ? m.index + m[0].length : 0;
}

// Texte de la note avec les reglages ecrits : le repere est remplace, ou ajoute sous les proprietes ; il est retire quand les reglages
// sont ceux par defaut.
export function writePageConfig(noteText: string, config: PageConfig): string {
  const eol = noteText.includes(`\r\n`) ? `\r\n` : `\n`;
  const found = findPageConfig(noteText);
  const isDefault = sameConfig(config, defaultConfig());
  if (found) {
    if (!isDefault) return noteText.slice(0, found.from) + formatPageMarker(config) + noteText.slice(found.to);
    const end = noteText.startsWith(`\r\n`, found.to) ? found.to + 2 : noteText.startsWith(`\n`, found.to) ? found.to + 1 : found.to;
    return noteText.slice(0, found.from) + noteText.slice(end);
  }
  if (isDefault) return noteText;
  const at = afterProperties(noteText);
  const needsEol = at > 0 && !/\n$/.test(noteText.slice(0, at));
  return `${noteText.slice(0, at)}${needsEol ? eol : ``}${formatPageMarker(config)}${eol}${noteText.slice(at)}`;
}

// Zones des pages de gauche reflechies d'apres celles des pages de droite : gauche et droite echangees.
export function mirrorZones(z: Zones): Zones {
  return { left: z.right, center: z.center, right: z.left };
}

// ---------------------------------------------------------------- balisage d'une zone

export type ZoneToken =
  | { kind: `text`; text: string; bold: boolean; italic: boolean; size: SizeCode }
  | { kind: `variable`; name: Variable; bold: boolean; italic: boolean; size: SizeCode }
  | { kind: `image`; target: string; height: number };

const TOKEN_RE = /!\[\[([^\]|]+)(?:\|(\d+(?:\.\d+)?))?\]\]|\*\*|\*|\{(xs|s|m|l)\}|\{(document|chapter|section|author|date|page|pages)\}/g;

// Decoupe le texte d'une zone en morceaux : texte, valeur variable ou image, avec leur mise en forme. `base` est la taille de depart.
export function parseZone(source: string, base: SizeCode = `m`): ZoneToken[] {
  const out: ZoneToken[] = [];
  let bold = false;
  let italic = false;
  let size: SizeCode = base;
  let last = 0;
  const pushText = (s: string): void => {
    if (s !== ``) out.push({ kind: `text`, text: s, bold, italic, size });
  };
  for (let m = TOKEN_RE.exec(source); m; m = TOKEN_RE.exec(source)) {
    pushText(source.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined) out.push({ kind: `image`, target: m[1].trim(), height: m[2] ? Number(m[2]) : 14 });
    else if (m[0] === `**`) bold = !bold;
    else if (m[0] === `*`) italic = !italic;
    else if (m[3] !== undefined) size = m[3] as SizeCode;
    else if (m[4] !== undefined) out.push({ kind: `variable`, name: m[4] as Variable, bold, italic, size });
  }
  pushText(source.slice(last));
  TOKEN_RE.lastIndex = 0;
  return out;
}

// Cibles des images ecrites dans les zones (pour les charger avant la composition).
export function configImages(config: PageConfig): { target: string; height: number }[] {
  const out: { target: string; height: number }[] = [];
  const all = [config.header, config.footer].flatMap((b) => [b.zones, b.verso]).flatMap((z) => [z.left, z.center, z.right]);
  for (const src of all) for (const t of parseZone(src)) if (t.kind === `image`) out.push({ target: t.target, height: t.height });
  return out;
}

// Valeurs des variables pour une page.
export interface PageValues {
  document: string;
  chapter: string;
  section: string;
  author: string;
  date: string;
  page: number;
  pages: number;
}

export const valueOf = (name: Variable, v: PageValues): string => (typeof v[name] === `number` ? String(v[name]) : (v[name] as string));
