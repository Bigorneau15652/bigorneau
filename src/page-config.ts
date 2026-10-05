// Reglages des pages d'une note : en-tete, pied de page et bord exterieur (ecrit a 90 degres). Ils sont ecrits dans la note, sur une ligne de commentaire
// Obsidian placee sous les proprietes : %% mmw-page {...} %%, invisible en lecture et masquee dans l'apercu en direct. Chaque zone de
// ces trois bandes est un texte avec un balisage minimal : **gras**, *italique*, {xs} {s} {m} {l} pour la taille,
// {document} {chapter} {section} {author} {date} {page} {pages} pour les valeurs variables, ![[image.png|largeur]] pour une image.
// Ce module ne depend pas d'Obsidian : il sert a l'export et aux fenetres de reglage.

export type SizeCode = `xs` | `s` | `m` | `l`;
export const SIZE_POINTS: Record<SizeCode, number> = { xs: 7, s: 8.5, m: 10, l: 12 };
export const SIZE_CODES: SizeCode[] = [`xs`, `s`, `m`, `l`];

export interface Zones {
  left: string;
  center: string;
  right: string;
}

export type NumberShape = `none` | `circle` | `square` | `rounded`;

// Forme dessinee derriere chaque {page} ecrit dans une bande, avec ses couleurs (#rrggbb).
export interface PageShape {
  shape: NumberShape;
  // Vide : pas de remplissage, pas de contour.
  fill: string;
  stroke: string;
  // Couleur du chiffre.
  color: string;
}

// Cadre derriere le texte d'une zone : meme forme, memes couleurs qu'un numero de page, avec une marge interieure en points entre le
// texte et le bord du cadre. La forme `none` : pas de cadre. Couleur du texte vide : la couleur habituelle.
export interface ZoneFrame extends PageShape {
  padding: number;
}

export interface Frames {
  left: ZoneFrame;
  center: ZoneFrame;
  right: ZoneFrame;
}

export const FRAME_MAX_PADDING = 20;
// Eloignement maximal du bord de la page, en millimetres.
export const DISTANCE_MAX_MM = 60;
export const POINTS_PER_MM = 72 / 25.4;

export interface Band {
  // Zones des pages de droite (recto), ou de toutes les pages.
  zones: Zones;
  // Pages de gauche differentes de celles de droite : `verso` donne les zones des pages de gauche.
  mirror: boolean;
  verso: Zones;
  // Filet fin entre le texte et la bande.
  rule: boolean;
  pageShape: PageShape;
  // Numero de page {page} droit (non tourne) quand la bande est tournee, c'est-a-dire sur le bord exterieur.
  pageUpright: boolean;
  // Cadres derriere le texte de chaque zone (les memes sur les pages de gauche et de droite).
  frames: Frames;
  // Distance entre le bord de la page et le bord exterieur de la bande (cadre compris), en millimetres ; null : place habituelle.
  distance: number | null;
}

export interface PageConfig {
  header: Band;
  footer: Band;
  // Bord exterieur de la page (a droite des pages de droite, a gauche des pages de gauche) : le texte y est ecrit a 90 degres. Les
  // zones gauche, centre et droite y sont, de haut en bas : haut, milieu et bas.
  edge: Band;
  // Pas d'en-tete, de pied de page ni de bord sur la premiere page (page de garde).
  skipFirst: boolean;
}

export const VARIABLES = [`document`, `chapter`, `section`, `author`, `date`, `created`, `modified`, `page`, `pages`] as const;
export type Variable = (typeof VARIABLES)[number];
// Valeurs proposees dans la fenetre : {pages} reste reconnu dans les notes qui l'utilisent, mais n'est plus propose.
export const OFFERED_VARIABLES: Variable[] = VARIABLES.filter((v) => v !== `pages`);

const emptyZones = (): Zones => ({ left: ``, center: ``, right: `` });

export const defaultShape = (): PageShape => ({ shape: `none`, fill: `#e9ecef`, stroke: `#495057`, color: `#212529` });

export const defaultFrame = (): ZoneFrame => ({ shape: `none`, fill: `#fff3bf`, stroke: ``, color: ``, padding: 3 });

export function defaultBand(): Band {
  return {
    zones: emptyZones(),
    mirror: false,
    verso: emptyZones(),
    rule: false,
    pageShape: defaultShape(),
    pageUpright: true,
    frames: { left: defaultFrame(), center: defaultFrame(), right: defaultFrame() },
    distance: null,
  };
}

export function defaultConfig(): PageConfig {
  return { header: defaultBand(), footer: defaultBand(), edge: defaultBand(), skipFirst: false };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === `object` && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === `string` ? v : ``);
const flag = (v: unknown, fallback: boolean): boolean => (typeof v === `boolean` ? v : fallback);
const pick = <T extends string>(v: unknown, allowed: T[], fallback: T): T => (typeof v === `string` && (allowed as string[]).includes(v) ? (v as T) : fallback);
const color = (v: unknown, fallback: string): string => (typeof v === `string` && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback);
// Couleur ou chaine vide (aucune couleur).
const colorOrNone = (v: unknown, fallback: string): string => (v === `` ? `` : color(v, fallback));

function zonesOf(v: unknown): Zones {
  const r = isObject(v) ? v : {};
  return { left: text(r.left), center: text(r.center), right: text(r.right) };
}

function shapeOf(v: unknown): PageShape {
  const r = isObject(v) ? v : {};
  const d = defaultShape();
  return { shape: pick(r.shape, [`none`, `circle`, `square`, `rounded`], d.shape), fill: colorOrNone(r.fill, d.fill), stroke: colorOrNone(r.stroke, d.stroke), color: color(r.color, d.color) };
}

function frameOf(v: unknown): ZoneFrame {
  const r = isObject(v) ? v : {};
  const d = defaultFrame();
  const padding = typeof r.padding === `number` && Number.isFinite(r.padding) ? Math.min(FRAME_MAX_PADDING, Math.max(0, r.padding)) : d.padding;
  return {
    shape: pick(r.shape, [`none`, `circle`, `square`, `rounded`], d.shape),
    fill: colorOrNone(r.fill, d.fill),
    stroke: colorOrNone(r.stroke, d.stroke),
    color: colorOrNone(r.color, d.color),
    padding,
  };
}

function framesOf(v: unknown): Frames {
  const r = isObject(v) ? v : {};
  return { left: frameOf(r.left), center: frameOf(r.center), right: frameOf(r.right) };
}

function bandOf(v: unknown): Band {
  const r = isObject(v) ? v : {};
  return { zones: zonesOf(r.zones), mirror: flag(r.mirror, false), verso: zonesOf(r.verso), rule: flag(r.rule, false), pageShape: shapeOf(r.pageShape),
    pageUpright: flag(r.pageUpright, true),
    frames: framesOf(r.frames),
    distance: typeof r.distance === `number` && Number.isFinite(r.distance) ? Math.min(DISTANCE_MAX_MM, Math.max(0, r.distance)) : null,
  };
}

// Reglages lus dans un objet JSON quelconque : tout ce qui est invalide est remplace par la valeur par defaut. L'ancienne
// numerotation (version 0.5.0 et 0.5.1) devient un {page} dans la zone correspondante, avec sa forme.
export function sanitizeConfig(raw: unknown): PageConfig {
  const r = isObject(raw) ? raw : {};
  const config: PageConfig = { header: bandOf(r.header), footer: bandOf(r.footer), edge: bandOf(r.edge), skipFirst: flag(r.skipFirst, false) };
  const n = isObject(r.numbering) ? r.numbering : null;
  if (n && n.enabled === true) {
    const place = pick(n.place, [`header`, `footer`, `outer`], `footer`);
    const band = place === `header` ? config.header : place === `outer` ? config.edge : config.footer;
    const align = pick(n.align, [`outer`, `inner`, `center`], `center`);
    const key = align === `center` ? `center` : align === `outer` ? `right` : `left`;
    const size = pick(n.size, SIZE_CODES, `m`);
    if (band.zones[key].trim() === ``) band.zones[key] = `{${size}}{page}`;
    band.pageShape = shapeOf({ shape: n.shape, fill: n.fill, stroke: n.stroke, color: n.color });
  }
  return config;
}

// Une bande (en-tete ou pied de page) existe des qu'une de ses zones est remplie : il n'y a pas d'interrupteur.
export function bandUsed(band: Band): boolean {
  const filled = (z: Zones): boolean => [z.left, z.center, z.right].some((s) => s.trim() !== ``);
  return filled(band.zones) || (band.mirror && filled(band.verso));
}

// Au moins une des trois bandes (en-tete, pied de page, bord exterieur) est utilisee.
export const anyDecor = (c: PageConfig): boolean => bandUsed(c.header) || bandUsed(c.footer) || bandUsed(c.edge);

// Limites des images de l'en-tete et du pied de page, en pixels (96 par pouce) : elles tiennent dans la marge de la page.
export const IMAGE_MAX_WIDTH_PX = 300;
export const IMAGE_MAX_HEIGHT_PX = 60;
// Nombre maximal de lignes d'une zone.
export const ZONE_MAX_LINES = 3;

// Couleur ecrite par l'utilisateur : #rrggbb ou #rgb (avec ou sans #), vide pour aucune ; null si elle n'est pas valide.
export function normalizeHex(input: string): string | null {
  const v = input.trim().replace(/^#/, ``).toLowerCase();
  if (v === ``) return ``;
  if (/^[0-9a-f]{6}$/.test(v)) return `#${v}`;
  if (/^[0-9a-f]{3}$/.test(v)) return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`;
  return null;
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
  | { kind: `image`; target: string; width: number | undefined };

const TOKEN_RE = /!\[\[([^\]|]+)(?:\|(\d+(?:\.\d+)?))?\]\]|\*\*|\*|\{(xs|s|m|l)\}|\{(document|chapter|section|author|date|created|modified|page|pages)\}/g;

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
    if (m[1] !== undefined) out.push({ kind: `image`, target: m[1].trim(), width: m[2] ? Number(m[2]) : undefined });
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
export function configImages(config: PageConfig): { target: string; width: number | undefined }[] {
  const out: { target: string; width: number | undefined }[] = [];
  const all = [config.header, config.footer].flatMap((b) => [b.zones, b.verso]).flatMap((z) => [z.left, z.center, z.right]);
  for (const src of all) for (const t of parseZone(src)) if (t.kind === `image`) out.push({ target: t.target, width: t.width });
  return out;
}

// Valeurs des variables pour une page.
export interface PageValues {
  document: string;
  chapter: string;
  section: string;
  author: string;
  date: string;
  // Dates de creation et de derniere modification de la note, ecrites dans la langue du document.
  created: string;
  modified: string;
  page: number;
  pages: number;
}

export const valueOf = (name: Variable, v: PageValues): string => (typeof v[name] === `number` ? String(v[name]) : (v[name] as string));
