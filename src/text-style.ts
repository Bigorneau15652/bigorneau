// Polices et styles des titres : pour chaque element du document (corps de texte, titre, titres de niveau 1 a 6, legendes, notes de bas de
// page, bandes de page), une police (celle d'origine ou une famille ajoutee au coffre), une taille (en plus ou en moins, en pourcentage),
// le gras et l'italique ; pour les titres, en plus : la casse, le soulignement et la numerotation. Le style general est dans les reglages
// du plugin ; une note peut le modifier champ par champ (voir `applyOverrides`). Ce module ne depend pas d'Obsidian.
import { FontStyle, isFamilyRegistered, userStyle, variantFrom, variantOf, withVariant } from "./export/font-metrics";

export type CaseMode = `none` | `upper` | `lower` | `capitalize`;
export type FrameMode = `none` | `text` | `full`;
export type NumberScheme = `none` | `decimal` | `outline`;

export interface TextSpec {
  // Identifiant de famille de police ajoutee au coffre ; vide : la police d'origine (Libertinus).
  family: string;
  // Hauteur de la police en points, comme dans Word (0 : taille d'origine de l'element).
  points: number;
  bold: boolean;
  italic: boolean;
  // Couleur du texte et surlignage derriere le texte (#rrggbb ; vide : couleur d'origine, pas de surlignage).
  color: string;
  highlight: string;
}

export type HeadingAlign = `left` | `center` | `right`;
const ALIGNS: HeadingAlign[] = [`left`, `center`, `right`];

export interface HeadingSpec extends TextSpec {
  // Place du titre dans la largeur de la colonne (un titre justifie n'a pas de sens : sa derniere ligne reste a gauche).
  align: HeadingAlign;
  case: CaseMode;
  underline: boolean;
  // Le titre de ce niveau est numerote quand une numerotation est choisie.
  numbered: boolean;
  // Cadre : aucun, ajuste au texte ou sur toute la largeur de la colonne ; epaisseur du trait en points, couleur du trait et du fond
  // (#rrggbb ; fond vide : transparent).
  frame: FrameMode;
  frameWidth: number;
  frameColor: string;
  frameFill: string;
}

export interface TypographyStyle {
  body: TextSpec;
  title: HeadingSpec;
  // Titres de niveau 1 a 6 (indice 0 : niveau 1).
  headings: HeadingSpec[];
  caption: TextSpec;
  footnote: TextSpec;
  // Texte de l'en-tete, du pied de page et du bord exterieur.
  decor: TextSpec;
  numbering: NumberScheme;
}

export const HEADING_LEVELS = 6;
// Hauteurs permises, en points (comme Word : 1 a 1638 ; ici de quoi couvrir un usage raisonnable).
export const POINTS_MIN = 4;
export const POINTS_MAX = 200;
export const FRAME_WIDTH_MIN = 0.25;
export const FRAME_WIDTH_MAX = 6;

// Hauteur d'origine de chaque element, en points : celle que l'export donne quand rien n'est regle. Pour l'en-tete et le pied de page,
// c'est la taille M ; les zones en XS, S ou L restent proportionnelles.
export const BASE_POINTS: Record<string, number> = { body: 11, title: 22, h1: 17, h2: 14, h3: 12, h4: 11, h5: 11, h6: 11, caption: 10, footnote: 9, decor: 10 };

const text = (bold = false): TextSpec => ({ family: ``, points: 0, bold, italic: false, color: ``, highlight: `` });
const heading = (): HeadingSpec => ({ ...text(true), align: `left`, case: `none`, underline: false, numbered: true, frame: `none`, frameWidth: 0.75, frameColor: `#000000`, frameFill: `` });

// Style d'origine : celui que l'export avait avant que l'on puisse le changer.
export const defaultTypography = (): TypographyStyle => ({
  body: text(),
  title: { ...heading(), numbered: false },
  headings: Array.from({ length: HEADING_LEVELS }, heading),
  caption: text(),
  footnote: text(),
  decor: text(),
  numbering: `none`,
});

const CASES: CaseMode[] = [`none`, `upper`, `lower`, `capitalize`];
const FRAMES: FrameMode[] = [`none`, `text`, `full`];
const HEX = /^#[0-9a-fA-F]{6}$/;
const SCHEMES: NumberScheme[] = [`none`, `decimal`, `outline`];

const asText = (raw: unknown, base: TextSpec): TextSpec => {
  const r = typeof raw === `object` && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    family: typeof r.family === `string` ? r.family : base.family,
    points: typeof r.points === `number` && Number.isFinite(r.points) ? (r.points <= 0 ? 0 : Math.max(POINTS_MIN, Math.min(POINTS_MAX, Math.round(r.points * 2) / 2))) : base.points,
    bold: typeof r.bold === `boolean` ? r.bold : base.bold,
    italic: typeof r.italic === `boolean` ? r.italic : base.italic,
    color: typeof r.color === `string` && (r.color === `` || HEX.test(r.color)) ? r.color.toLowerCase() : base.color,
    highlight: typeof r.highlight === `string` && (r.highlight === `` || HEX.test(r.highlight)) ? r.highlight.toLowerCase() : base.highlight,
  };
};

const asHeading = (raw: unknown, base: HeadingSpec): HeadingSpec => {
  const r = typeof raw === `object` && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    ...asText(raw, base),
    align: ALIGNS.includes(r.align as HeadingAlign) ? (r.align as HeadingAlign) : base.align,
    case: CASES.includes(r.case as CaseMode) ? (r.case as CaseMode) : base.case,
    underline: typeof r.underline === `boolean` ? r.underline : base.underline,
    numbered: typeof r.numbered === `boolean` ? r.numbered : base.numbered,
    frame: FRAMES.includes(r.frame as FrameMode) ? (r.frame as FrameMode) : base.frame,
    frameWidth: typeof r.frameWidth === `number` && Number.isFinite(r.frameWidth) ? Math.max(FRAME_WIDTH_MIN, Math.min(FRAME_WIDTH_MAX, Math.round(r.frameWidth * 4) / 4)) : base.frameWidth,
    frameColor: typeof r.frameColor === `string` && HEX.test(r.frameColor) ? r.frameColor.toLowerCase() : base.frameColor,
    frameFill: typeof r.frameFill === `string` && (r.frameFill === `` || HEX.test(r.frameFill)) ? r.frameFill.toLowerCase() : base.frameFill,
  };
};

// Style nettoye : les valeurs inconnues ou absentes reprennent celles du style d'origine.
export function sanitizeTypography(raw: unknown): TypographyStyle {
  const d = defaultTypography();
  const r = typeof raw === `object` && raw !== null ? (raw as Record<string, unknown>) : {};
  const hs = Array.isArray(r.headings) ? r.headings : [];
  return {
    body: asText(r.body, d.body),
    title: asHeading(r.title, d.title),
    headings: d.headings.map((h, i) => asHeading(hs[i], h)),
    caption: asText(r.caption, d.caption),
    footnote: asText(r.footnote, d.footnote),
    decor: asText(r.decor, d.decor),
    numbering: SCHEMES.includes(r.numbering as NumberScheme) ? (r.numbering as NumberScheme) : d.numbering,
  };
}

// ---------------------------------------------------------------------------------------------------- reglages d'une note

// Une note ne garde que ce qu'elle change : un champ par chemin (`body.family`, `h2.size`, `numbering`...). Les autres champs suivent
// le style general, meme quand on le modifie plus tard.
export type Overrides = Record<string, string | number | boolean>;

const GROUPS = [`body`, `title`, `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `caption`, `footnote`, `decor`] as const;
const TEXT_FIELDS = [`family`, `points`, `bold`, `italic`, `color`, `highlight`] as const;
const HEADING_FIELDS = [...TEXT_FIELDS, `align`, `case`, `underline`, `numbered`, `frame`, `frameWidth`, `frameColor`, `frameFill`] as const;

const isHeadingGroup = (g: string): boolean => g === `title` || /^h[1-6]$/.test(g);

// Tous les chemins que l'on peut regler.
export function overridePaths(): string[] {
  const out: string[] = [`numbering`];
  for (const g of GROUPS) for (const f of isHeadingGroup(g) ? HEADING_FIELDS : TEXT_FIELDS) out.push(`${g}.${f}`);
  return out;
}

const VALID = new Set(overridePaths());

function groupOf(style: TypographyStyle, group: string): TextSpec | HeadingSpec | undefined {
  if (group === `title`) return style.title;
  const m = /^h([1-6])$/.exec(group);
  if (m) return style.headings[Number(m[1]) - 1];
  return (style as unknown as Record<string, TextSpec>)[group];
}

export function getPath(style: TypographyStyle, path: string): string | number | boolean | undefined {
  if (path === `numbering`) return style.numbering;
  const [g, f] = path.split(`.`);
  const spec = groupOf(style, g);
  return spec ? ((spec as unknown as Record<string, string | number | boolean>)[f] as string | number | boolean | undefined) : undefined;
}

// Nouveau style avec le champ `path` change (le style donne n'est pas modifie). Une valeur invalide est ramenee par `sanitize`.
export function setPath(style: TypographyStyle, path: string, value: string | number | boolean): TypographyStyle {
  if (!VALID.has(path)) return style;
  const copy = JSON.parse(JSON.stringify(style)) as TypographyStyle;
  if (path === `numbering`) copy.numbering = value as NumberScheme;
  else {
    const [g, f] = path.split(`.`);
    const spec = groupOf(copy, g);
    if (spec) (spec as unknown as Record<string, unknown>)[f] = value;
  }
  return sanitizeTypography(copy);
}

// Reglages de la note nettoyes : chemins connus, valeurs du bon type.
export function sanitizeOverrides(raw: unknown): Overrides {
  const out: Overrides = {};
  if (typeof raw !== `object` || raw === null || Array.isArray(raw)) return out;
  const base = defaultTypography();
  for (const [path, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!VALID.has(path) || (typeof value !== `string` && typeof value !== `number` && typeof value !== `boolean`)) continue;
    // Une valeur du mauvais type ou hors des choix possibles est ecartee : on la fait passer par le nettoyage de style.
    const probe = getPath(setPath(base, path, value), path);
    if (probe === value || (typeof value === `number` && typeof probe === `number`)) out[path] = probe as string | number | boolean;
  }
  return out;
}

// Style general modifie par les reglages d'une note.
export function applyOverrides(style: TypographyStyle, overrides: Overrides | undefined): TypographyStyle {
  let out = style;
  for (const [path, value] of Object.entries(overrides ?? {})) out = setPath(out, path, value);
  return out;
}

// ---------------------------------------------------------------------------------------------------- effets sur le texte

// Facteur de taille d'un element dont la hauteur d'origine est `base` points : 1 pour la taille d'origine.
export const sizeFactor = (spec: TextSpec, base: number): number => (spec.points > 0 ? spec.points / base : 1);

// Texte dans la casse demandee. Le texte peut contenir les reperes de la mise en forme (caracteres d'usage prive), que la casse ne touche pas.
export function applyCase(value: string, mode: CaseMode): string {
  if (mode === `upper`) return value.toLocaleUpperCase(`fr`);
  if (mode === `lower`) return value.toLocaleLowerCase(`fr`);
  if (mode === `capitalize`) return value.toLocaleLowerCase(`fr`).replace(/(^|[\s(«"'’\- ])(\p{L})/gu, (_m, before: string, letter: string) => `${before}${letter.toLocaleUpperCase(`fr`)}`);
  return value;
}

const ROMAN: [number, string][] = [
  [1000, `M`],
  [900, `CM`],
  [500, `D`],
  [400, `CD`],
  [100, `C`],
  [90, `XC`],
  [50, `L`],
  [40, `XL`],
  [10, `X`],
  [9, `IX`],
  [5, `V`],
  [4, `IV`],
  [1, `I`],
];

export function roman(n: number): string {
  let rest = Math.max(1, Math.floor(n));
  let out = ``;
  for (const [value, symbol] of ROMAN) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

// Lettre de rang n : 1 -> A, 26 -> Z, 27 -> AA.
export function letters(n: number): string {
  let rest = Math.max(1, Math.floor(n));
  let out = ``;
  while (rest > 0) {
    rest -= 1;
    out = String.fromCharCode(65 + (rest % 26)) + out;
    rest = Math.floor(rest / 26);
  }
  return out;
}

// Numero d'un titre d'apres sa place : `path` donne le rang de ses parents numerotes puis le sien (3, 1, 2 : troisieme chapitre,
// premiere partie, deuxieme section). Decimale : 3.1.2. Plan : I., A., 1., a), i) selon la profondeur.
export function headingNumber(scheme: NumberScheme, path: number[]): string {
  if (scheme === `none` || path.length === 0) return ``;
  if (scheme === `decimal`) return path.join(`.`);
  const n = path[path.length - 1];
  switch (path.length) {
    case 1:
      return `${roman(n)}.`;
    case 2:
      return `${letters(n)}.`;
    case 3:
      return `${n}.`;
    case 4:
      return `${letters(n).toLowerCase()})`;
    default:
      return `${roman(n).toLowerCase()})`;
  }
}

// Police de composition d'un element : la famille ajoutee au coffre quand elle est chargee (sinon la police d'origine), en gras et en
// italique selon les choix.
export function styleOf(spec: TextSpec, boldToo = false): FontStyle {
  const variant = variantFrom(spec.bold || boldToo, spec.italic);
  return spec.family !== `` && isFamilyRegistered(spec.family) ? userStyle(spec.family, variant) : variant;
}

// Le style `style` (normal, gras, italique...) dans la famille de `base` : sert aux cellules de tableaux et aux listes, dont le style
// vient de la mise en page et non du texte.
export function inFamilyOf(base: FontStyle, style: FontStyle): FontStyle {
  return style === `mono` ? style : withVariant(base, variantOf(style));
}
