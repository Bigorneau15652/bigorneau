// Export de haute qualite, etage 3 : mesure du texte avec les polices du premier gabarit (Libertinus Serif : normal, italique,
// gras, gras italique ; Libertinus Mono pour le code). Les largeurs viennent de la mise en forme reelle (ligatures et crenage compris, voir font.ts) : elles
// correspondent a celles que calcule le navigateur pour afficher le meme texte.
import { OpenTypeFont } from "./font";
import { FONT_FILES } from "./fonts-libertinus";

// Les quatre styles de Libertinus Serif et Libertinus Mono (chasse fixe pour le code et les tableaux).
export type BuiltinStyle = `regular` | `italic` | `bold` | `boldItalic` | `mono`;
export const FONT_STYLES: BuiltinStyle[] = [`regular`, `italic`, `bold`, `boldItalic`, `mono`];

// Variante d'une famille : normal, italique, gras, gras italique.
export type Variant = `regular` | `italic` | `bold` | `boldItalic`;

// Style d'une police ajoutee par l'utilisateur : u:identifiant-de-famille:variante. Un style est ainsi un simple texte, qui traverse la
// mise en page (paragraphes, lignes, PDF) sans qu'elle ait a connaitre les familles.
export type UserStyle = `u:${string}:${Variant}`;
export type FontStyle = BuiltinStyle | UserStyle;

const USER_STYLE = /^u:(.+):(regular|italic|bold|boldItalic)$/;

export function parseUserStyle(style: string): { family: string; variant: Variant } | null {
  const m = USER_STYLE.exec(style);
  return m ? { family: m[1], variant: m[2] as Variant } : null;
}

export const userStyle = (family: string, variant: Variant): UserStyle => `u:${family}:${variant}`;

// Variante d'un style (le style de chasse fixe compte comme normal).
export function variantOf(style: FontStyle): Variant {
  const u = parseUserStyle(style);
  if (u) return u.variant;
  return style === `mono` ? `regular` : (style as Variant);
}

export const variantFrom = (bold: boolean, italic: boolean): Variant => (bold ? (italic ? `boldItalic` : `bold`) : italic ? `italic` : `regular`);

// Meme famille, autre variante (gras, italique...).
export function withVariant(style: FontStyle, variant: Variant): FontStyle {
  const u = parseUserStyle(style);
  return u ? userStyle(u.family, variant) : variant;
}

// Polices ajoutees par l'utilisateur, par famille. Une variante absente est remplacee par la plus proche (gras italique -> gras ->
// italique -> normal) : une famille qui n'a qu'un style reste utilisable, sans gras ni italique.
const families = new Map<string, Partial<Record<Variant, OpenTypeFont>>>();
const FALLBACK_ORDER: Record<Variant, Variant[]> = {
  regular: [`regular`, `italic`, `bold`, `boldItalic`],
  italic: [`italic`, `regular`, `boldItalic`, `bold`],
  bold: [`bold`, `regular`, `boldItalic`, `italic`],
  boldItalic: [`boldItalic`, `bold`, `italic`, `regular`],
};

// Counter that changes each time the registered fonts change: results computed with other fonts must not be reused.
let fontEpoch = 0;

export function fontsEpoch(): number {
  return fontEpoch;
}

export function registerFontFamily(id: string, fonts: Partial<Record<Variant, OpenTypeFont>>): void {
  families.set(id, fonts);
  fontEpoch++;
}

export function clearFontFamilies(): void {
  families.clear();
  fontEpoch++;
}

export const isFamilyRegistered = (id: string): boolean => families.has(id);

// Variante de la famille qui sera reellement utilisee pour `variant` (pour ecrire le bon nom de police dans le PDF).
export function resolvedVariant(familyId: string, variant: Variant): Variant | null {
  const fam = families.get(familyId);
  if (!fam) return null;
  return FALLBACK_ORDER[variant].find((v) => fam[v] !== undefined) ?? null;
}

export const FINE_SPACE = `\u202F`;
export const NO_BREAK_SPACE = `\u00A0`;

// Caractere de remplacement quand la police n'a pas le caractere demande.
const FALLBACK = 0x3f;

const fonts = new Map<BuiltinStyle, OpenTypeFont>();
const bytes = new Map<BuiltinStyle, Uint8Array>();

// Octets du fichier de police d'un style (decodes une seule fois).
export function fontBytes(style: BuiltinStyle): Uint8Array {
  let b = bytes.get(style);
  if (!b) {
    const binary = atob(FONT_FILES[style]);
    b = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) b[i] = binary.charCodeAt(i);
    bytes.set(style, b);
  }
  return b;
}

export function fontFor(style: FontStyle = `regular`): OpenTypeFont {
  const u = parseUserStyle(style);
  if (u) {
    const fam = families.get(u.family);
    const found = fam ? FALLBACK_ORDER[u.variant].map((v) => fam[v]).find((f) => f !== undefined) : undefined;
    // Famille inconnue (police retiree du coffre) : la police d'origine, a la meme variante.
    return found ?? fontFor(u.variant);
  }
  // Not a user font: the style is one of the built-in ones.
  const builtin = style as BuiltinStyle;
  let f = fonts.get(builtin);
  if (!f) {
    f = new OpenTypeFont(fontBytes(builtin));
    fonts.set(builtin, f);
  }
  return f;
}

export interface TextMeasure {
  // Largeur en points.
  width: number;
  // Caracteres absents de la police, a signaler dans le rapport d'export.
  missing: number[];
}

export function hasGlyph(cp: number, style: FontStyle = `regular`): boolean {
  return fontFor(style).hasChar(cp);
}

// Largeur d'un caractere seul, en unites de la police.
export function charUnits(cp: number, style: FontStyle = `regular`): number {
  const f = fontFor(style);
  return f.advance(f.cmap.get(cp) ?? f.cmap.get(FALLBACK) ?? 0);
}

// Largeur d'un texte, en points, a la taille `size` (en points).
export function measureText(text: string, size: number, style: FontStyle = `regular`): TextMeasure {
  const f = fontFor(style);
  const missing: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (!f.hasChar(cp)) missing.push(cp);
  }
  return { width: (f.width(text) * size) / f.unitsPerEm, missing };
}

// Hauteurs de la police (au-dessus et au-dessous de la ligne de base), en points.
export const fontAscender = (size: number): number => (fontFor().ascender * size) / fontFor().unitsPerEm;
export const fontDescender = (size: number): number => (fontFor().descender * size) / fontFor().unitsPerEm;
